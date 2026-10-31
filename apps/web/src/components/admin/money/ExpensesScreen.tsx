'use client';
// S16 · PR 344 — the cards of Money → Expenses (/admin/money/expenses): the quick entry (head, day, amount, note), the
// month's expenses with their totals by head and a reverse-with-a-reason on each, and "More options": the heads (add one
// with its cost line; put one away or bring it back). Writes go to /api/admin/money/expenses/* and the page is read
// again. An expense is sent with a request key kept until it is written, so a double tap records it once. Amounts are
// read like the Books pages (`typedMinor`). Without `fixedcosts.write` the page is read-only. Nothing here moves money.
// PR 344 follow-up: while `costs.receipts` is on, a receipt's photo or PDF is added before the expense (uploaded on
// choosing it) and each entry with one links to it.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { typedMinor } from '@/lib/admin-books/money';
import type { ExpenseHeadRow, ExpensesView } from '@/lib/expenses-api';
import { call } from '../api';
import { formatMoney, type Money } from '../products/model';

export interface ExpensesScreenProps {
  dict: Dict;
  lang: 'en' | 'bn';
  money: Money;
  view: ExpensesView;
  lines: readonly string[];
  today: string;
  openFrom: string;
  linked: boolean;
  canEdit: boolean;
  /** `costs.receipts`: whether a receipt can be added, and its largest size. */
  receipts: { enabled: boolean; maxMb: number };
}

const newKey = (): string => globalThis.crypto?.randomUUID?.() ?? `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export function ExpensesScreen(p: ExpensesScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `moneyExpenses.${k}`, vars);
  const lineName = (l: string) => t(p.dict, `moneyCosts.line.${l}`);
  const m = (minor: number) => formatMoney(minor, p.money);
  const monthText = new Intl.DateTimeFormat(p.money.locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${p.view.month}-01T00:00:00Z`));
  const dayText = (day: string) => new Intl.DateTimeFormat(p.money.locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const headName = (h: ExpenseHeadRow | undefined) => (h ? (p.lang === 'bn' && h.nameBn ? h.nameBn : h.nameEn) : '—');
  const heads = new Map(p.view.heads.map((h) => [h.id, h]));
  const active = p.view.heads.filter((h) => !h.archived);
  const errText = (code: string | undefined) => {
    for (const k of [`moneyExpenses.err.${code}`, `moneyCosts.err.${code}`]) {
      const v = t(p.dict, k);
      if (v !== k) return v;
    }
    return c('err.other');
  };
  const off = !p.canEdit || !p.linked;

  const [headId, setHeadId] = useState(active[0]?.id ?? '');
  const [day, setDay] = useState(p.today);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [reqKey, setReqKey] = useState(newKey);
  const [receipt, setReceipt] = useState<{ id: string; name: string } | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [undo, setUndo] = useState<{ id: string; reason: string } | null>(null);
  const [hEn, setHEn] = useState('');
  const [hBn, setHBn] = useState('');
  const [hLine, setHLine] = useState(p.lines.includes('OTHER') ? 'OTHER' : (p.lines[0] ?? 'OTHER'));
  const [hSaid, setHSaid] = useState<{ text: string; bad: boolean } | null>(null);

  async function add() {
    if (!headId) return setSaid({ text: c('entry.needHead'), bad: true });
    const amountMinor = amount.trim() ? typedMinor(amount, p.money.digits) : null;
    if (amountMinor === null || amountMinor <= 0) return setSaid({ text: c('entry.badAmount'), bad: true });
    setBusy(true);
    const a = await call('POST', '/api/admin/money/expenses', { headId, day, amountMinor, note: note.trim() || null, receiptId: receipt?.id ?? null, requestKey: reqKey });
    setBusy(false);
    if (a.status === 201 || a.status === 200) {
      setReqKey(newKey());
      setAmount('');
      setNote('');
      setReceipt(null);
      setFileKey((k) => k + 1);
      setSaid({ text: c('entry.added'), bad: false });
      return router.refresh();
    }
    setSaid({ text: errText(a.status === 0 ? 'network' : a.data.error), bad: true });
  }
  async function addReceipt(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    if (f.size > p.receipts.maxMb * 1024 * 1024) return setSaid({ text: errText('TOO_LARGE'), bad: true });
    setBusy(true);
    setSaid({ text: c('entry.receiptAdding'), bad: false });
    const form = new FormData();
    form.append('file', f);
    try {
      const res = await fetch('/api/admin/money/expenses/receipts', { method: 'POST', body: form, credentials: 'same-origin', cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; file?: { id: string; fileName: string | null } };
      if (res.status === 201 && data.file) {
        setReceipt({ id: data.file.id, name: data.file.fileName ?? f.name });
        setSaid({ text: c('entry.receiptAdded', { name: data.file.fileName ?? f.name }), bad: false });
      } else {
        setFileKey((k) => k + 1);
        setSaid({ text: errText(data.error), bad: true });
      }
    } catch {
      setSaid({ text: errText('network'), bad: true });
    }
    setBusy(false);
  }
  async function reverse() {
    if (!undo) return;
    if (!undo.reason.trim()) return setSaid({ text: errText('REASON_REQUIRED'), bad: true });
    setBusy(true);
    const a = await call('POST', `/api/admin/money/expenses/${undo.id}/reverse`, { reason: undo.reason.trim() });
    setBusy(false);
    if (a.status === 201) {
      setUndo(null);
      setSaid({ text: c('list.reversedNow'), bad: false });
      return router.refresh();
    }
    setSaid({ text: errText(a.status === 0 ? 'network' : a.data.error), bad: true });
  }
  async function addHead() {
    if (!hEn.trim()) return setHSaid({ text: c('heads.needName'), bad: true });
    setBusy(true);
    const a = await call('POST', '/api/admin/money/expenses/heads', { nameEn: hEn.trim(), nameBn: hBn.trim() || null, line: hLine });
    setBusy(false);
    if (a.status === 201) {
      setHEn('');
      setHBn('');
      setHSaid({ text: c('heads.added'), bad: false });
      return router.refresh();
    }
    setHSaid({ text: errText(a.status === 0 ? 'network' : a.data.error), bad: true });
  }
  async function archive(h: ExpenseHeadRow) {
    setBusy(true);
    const a = await call('POST', `/api/admin/money/expenses/heads/${h.id}/archive`, { archived: !h.archived });
    setBusy(false);
    if (a.status === 200) return router.refresh();
    setHSaid({ text: errText(a.status === 0 ? 'network' : a.data.error), bad: true });
  }
  const say = (s: { text: string; bad: boolean } | null, testId: string) =>
    s ? (
      <p className={`a2-sm a2-mt6 ${s.bad ? 'bk-warn' : 'a2-mute'}`} role={s.bad ? 'alert' : 'status'} data-testid={testId}>
        {s.text}
      </p>
    ) : null;

  return (
    <>
      <section className="a2-card a2-mt12" aria-labelledby={`${id}-e`} data-testid="ex-entry">
        <h2 className="a2-h3" id={`${id}-e`}>
          {c('entry.title')}
        </h2>
        <p className="a2-cs">{c('entry.sub')}</p>
        {!p.linked ? (
          <p className="a2-xs bk-warn a2-mt12">{c('notLinked')}</p>
        ) : !p.canEdit ? (
          <p className="a2-xs a2-mute a2-mt12">{c('readOnly')}</p>
        ) : !active.length ? (
          <p className="a2-xs a2-mute a2-mt12">{c('entry.noHeads')}</p>
        ) : (
          <div className="ct-form a2-mt12">
            <div className="ct-grid">
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-h`}>
                  {c('entry.head')}
                </label>
                <select id={`${id}-h`} className="a2-sel" value={headId} disabled={busy} onChange={(e) => setHeadId(e.target.value)} data-testid="ex-head">
                  {active.map((h) => (
                    <option key={h.id} value={h.id}>
                      {headName(h)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-d`}>
                  {c('entry.day')}
                </label>
                <input id={`${id}-d`} type="date" className="a2-inp" min={p.openFrom} max={p.today} value={day} disabled={busy} onChange={(e) => setDay(e.target.value)} data-testid="ex-day" />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-a`}>
                  {c('entry.amount')} ({p.money.currency})
                </label>
                <input id={`${id}-a`} className="a2-inp" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value)} data-testid="ex-amount" />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-n`}>
                  {c('entry.note')}
                </label>
                <input id={`${id}-n`} className="a2-inp" maxLength={300} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid="ex-note" />
              </div>
              {p.receipts.enabled ? (
                <div className="a2-fld">
                  <label className="a2-lbl" htmlFor={`${id}-r`}>
                    {c('entry.receipt')}
                  </label>
                  {receipt ? (
                    <span className="ct-actions">
                      <span className="a2-sm" data-testid="ex-receipt-name">
                        {receipt.name}
                      </span>
                      <button
                        type="button"
                        className="a2-btn"
                        disabled={busy}
                        onClick={() => {
                          setReceipt(null);
                          setFileKey((k) => k + 1);
                        }}
                      >
                        {c('entry.receiptRemove')}
                      </button>
                    </span>
                  ) : (
                    <input key={fileKey} id={`${id}-r`} type="file" className="a2-inp" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={(e) => addReceipt(e.target.files)} data-testid="ex-receipt" />
                  )}
                  <span className="a2-xs a2-mute">{c('entry.receiptHint', { mb: p.receipts.maxMb })}</span>
                </div>
              ) : null}
            </div>
            <p className="a2-xs a2-mute ct-hint">{c('entry.where', { line: lineName(heads.get(headId)?.line ?? 'OTHER') })}</p>
            <div className="ct-actions">
              <button type="button" className="a2-btn pri" disabled={busy} onClick={add} data-testid="ex-add">
                {busy ? c('entry.adding') : c('entry.add')}
              </button>
            </div>
          </div>
        )}
        {say(said, 'ex-said')}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby={`${id}-l`} data-testid="ex-list">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id={`${id}-l`}>
              {c('list.title', { month: monthText })}
            </h2>
            <div className="a2-cs">{c('list.sub')}</div>
          </div>
          <span className="a2-pill">{m(p.view.totalMinor)}</span>
        </div>
        {p.view.byHead.map((b) => (
          <div key={b.headId} className="a2-rule" data-testid="ex-by-head">
            <span>{headName(heads.get(b.headId))}</span>
            <span className="a2-xs a2-mute">{c('list.count', { n: b.count })}</span>
            <b>{m(b.minor)}</b>
          </div>
        ))}
        <h3 className="a2-h3 a2-mt12">{c('list.rows')}</h3>
        {p.view.rows.length ? (
          p.view.rows.map((r) => (
            <div key={r.id} className="a2-rule" data-testid="ex-row" data-reversed={r.reversed ? 'yes' : 'no'}>
              <span>
                <b>{headName(heads.get(r.headId))}</b>
                <span className="a2-xs a2-mute cl-sub">
                  {[dayText(r.day), r.reversal ? c('list.reversal') : null, r.reversed ? c('list.reversed') : null, r.note].filter(Boolean).join(' · ')}
                  {r.receiptId ? (
                    <>
                      {' · '}
                      <a href={`/api/admin/money/expenses/receipts/${r.receiptId}`} target="_blank" rel="noopener" className="bk-act" data-testid="ex-receipt-link">
                        {c('entry.receiptOpen')}
                      </a>
                    </>
                  ) : null}
                </span>
              </span>
              <span>
                {!off && !r.reversal && !r.reversed && r.day >= p.openFrom ? (
                  undo?.id === r.id ? (
                    <span className="ct-actions">
                      <input className="a2-inp" aria-label={c('list.reason')} placeholder={c('list.reason')} maxLength={500} value={undo.reason} onChange={(e) => setUndo({ id: r.id, reason: e.target.value })} data-testid="ex-reason" />
                      <button type="button" className="a2-btn" disabled={busy} onClick={reverse} data-testid="ex-reverse-go">
                        {c('list.reverseGo')}
                      </button>
                      <button type="button" className="a2-btn" disabled={busy} onClick={() => setUndo(null)}>
                        {c('list.cancel')}
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="a2-btn" disabled={busy} onClick={() => setUndo({ id: r.id, reason: '' })} data-testid="ex-reverse">
                      {c('list.reverse')}
                    </button>
                  )
                ) : null}
              </span>
              <b>{m(r.amountMinor)}</b>
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute">{c('list.none')}</p>
        )}
      </section>

      <details className="a2-card a2-mt12" data-testid="ex-heads">
        <summary className="a2-h3 ex-sum">{c('heads.title')}</summary>
        <p className="a2-cs">{c('heads.sub')}</p>
        {p.view.heads.length ? (
          p.view.heads.map((h) => (
            <div key={h.id} className="a2-rule" data-testid="ex-head-row" data-archived={h.archived ? 'yes' : 'no'}>
              <span>
                <b>{headName(h)}</b>
                <span className="a2-xs a2-mute cl-sub">{[lineName(h.line), h.archived ? c('heads.archived') : null].filter(Boolean).join(' · ')}</span>
              </span>
              <span />
              {p.canEdit ? (
                <button type="button" className="a2-btn" disabled={busy} onClick={() => archive(h)} data-testid="ex-head-archive">
                  {h.archived ? c('heads.restore') : c('heads.archive')}
                </button>
              ) : (
                <span />
              )}
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute">{c('heads.none')}</p>
        )}
        {p.canEdit ? (
          <div className="ct-form a2-mt12">
            <div className="ct-grid">
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-hen`}>
                  {c('heads.nameEn')}
                </label>
                <input id={`${id}-hen`} className="a2-inp" maxLength={80} value={hEn} disabled={busy} onChange={(e) => setHEn(e.target.value)} data-testid="ex-head-en" />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-hbn`}>
                  {c('heads.nameBn')}
                </label>
                <input id={`${id}-hbn`} className="a2-inp" maxLength={80} value={hBn} disabled={busy} onChange={(e) => setHBn(e.target.value)} data-testid="ex-head-bn" />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-hl`}>
                  {c('heads.line')}
                </label>
                <select id={`${id}-hl`} className="a2-sel" value={hLine} disabled={busy} onChange={(e) => setHLine(e.target.value)} data-testid="ex-head-line">
                  {p.lines.map((l) => (
                    <option key={l} value={l}>
                      {lineName(l)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="ct-actions">
              <button type="button" className="a2-btn" disabled={busy} onClick={addHead} data-testid="ex-head-add">
                {c('heads.add')}
              </button>
            </div>
          </div>
        ) : null}
        {say(hSaid, 'ex-head-said')}
      </details>
    </>
  );
}
