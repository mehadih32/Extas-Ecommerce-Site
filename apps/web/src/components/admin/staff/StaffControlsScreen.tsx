'use client';
// S28 · PR 702 — Settings → Staff controls: the limits table (discount in Tk and percent, the export rows read-only,
// hide phone and address), the packer role, and the end-of-day cash / bKash handover sheet. Writes go to
// /api/admin/staff-controls/*; the limits need the owner's PIN. Nothing here moves money.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { typedMinor } from '@/lib/admin-books/money';
import type { HandoverRow, StaffControlsView } from '@/lib/staff-controls';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { formatMoney, type Money } from '../products/model';

export interface StaffControlsScreenProps {
  dict: Dict;
  money: Money;
  view: StaffControlsView;
  canEdit: boolean;
  canMakeRole: boolean;
  day: string;
  today: string;
  sheet: { rows: HandoverRow[]; names: Record<string, string> };
  exportKeys: readonly string[];
}

interface Draft {
  amount: string;
  pct: string;
  hide: boolean;
}

export function StaffControlsScreen(p: StaffControlsScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `staffControls.${k}`, vars);
  const m = (minor: number) => formatMoney(minor, p.money);
  const unit = 10 ** p.money.digits;
  const [draft, setDraft] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(p.view.roles.map((r) => [r.key, { amount: r.limit.maxDiscountMinor === null ? '' : String(r.limit.maxDiscountMinor / unit), pct: r.limit.maxDiscountPct === null ? '' : String(r.limit.maxDiscountPct), hide: r.limit.hideContact }])),
  );
  const [on, setOn] = useState(p.view.handover.enabled);
  const [time, setTime] = useState(p.view.handover.time);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [day, setDay] = useState(p.day);
  const [method, setMethod] = useState<'CASH' | 'WALLET'>('CASH');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');

  const roles = p.view.roles.filter((r) => r.key !== 'owner');
  const set = (key: string, patch: Partial<Draft>) => setDraft((d) => ({ ...d, [key]: { ...d[key]!, ...patch } }));

  const err = (a: { status: number; data: { error?: string } }) => {
    const k = `staffControls.errors.${a.status === 0 ? 'network' : (a.data.error ?? 'server-error')}`;
    const v = t(p.dict, k);
    return v === k ? c('errors.server-error') : v;
  };
  async function save() {
    const limits: Record<string, { maxDiscountMinor: number | null; maxDiscountPct: number | null; hideContact: boolean }> = {};
    for (const r of roles) {
      const d = draft[r.key]!;
      const minor = d.amount.trim() === '' ? null : typedMinor(d.amount, p.money.digits);
      const pct = d.pct.trim() === '' ? null : Number(d.pct);
      if ((d.amount.trim() !== '' && minor === null) || (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100))) return setSaid({ text: c('errors.INVALID_INPUT'), bad: true });
      if (minor === null && pct === null && !d.hide) continue; // nothing set: the role is not listed
      limits[r.key] = { maxDiscountMinor: minor, maxDiscountPct: pct, hideContact: d.hide };
    }
    setBusy(true);
    const a = await call('POST', '/api/admin/staff-controls', { limits, handover: { enabled: on, time }, pin });
    setBusy(false);
    if (a.status === 200) {
      setPin('');
      setSaid({ text: c('limits.saved'), bad: false });
      showToast({ text: c('limits.saved'), tone: 'ok' });
      return router.refresh();
    }
    setSaid({ text: err(a), bad: true });
  }
  async function makePacker() {
    setBusy(true);
    const a = await call('POST', '/api/admin/staff-controls/packer-role', {});
    setBusy(false);
    if (a.status === 201) return router.refresh();
    setSaid({ text: err(a), bad: true });
  }
  async function hand() {
    const minor = typedMinor(counted, p.money.digits);
    if (minor === null) return setSaid({ text: c('errors.INVALID_INPUT'), bad: true });
    setBusy(true);
    const a = await call('POST', '/api/admin/staff-controls/handover', { day, method, countedMinor: minor, note: note.trim() || null });
    setBusy(false);
    if (a.status === 201) {
      setCounted('');
      setNote('');
      setSaid({ text: c('handover.written'), bad: false });
      return router.refresh();
    }
    setSaid({ text: err(a), bad: true });
  }
  const diff = (n: number) => (n === 0 ? <span className="s28-good">{c('handover.match')}</span> : n < 0 ? <span className="s28-bad">{c('handover.short')} {m(-n)}</span> : <span className="s28-warn">{c('handover.over')} {m(n)}</span>);

  return (
    <>
      <section className="a2-card a2-mt12" aria-labelledby={`${id}-l`} data-testid="staff-limits">
        <h2 className="a2-h3" id={`${id}-l`}>{c('limits.title')}</h2>
        <p className="a2-cs">{c('limits.sub')}</p>
        <div className="s28-tw a2-mt12">
          <table className="s28-tbl">
            <thead>
              <tr>
                <th>{c('limits.role')}</th>
                <th className="r">{c('limits.maxAmount')}</th>
                <th className="r">{c('limits.maxPct')}</th>
                <th>{c('limits.export')}</th>
                <th>{c('limits.hide')}</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const d = draft[r.key]!;
                const ex = p.exportKeys.filter((k) => r.exports[k as keyof typeof r.exports]);
                return (
                  <tr key={r.key} data-testid={`role-${r.key}`}>
                    <td>
                      <b>{r.nameEn}</b>
                      <div className="a2-xs a2-mute">{c('limits.people', { n: r.people })}</div>
                    </td>
                    <td className="r">
                      <input className="a2-inp" inputMode="decimal" style={{ width: 110, textAlign: 'right' }} value={d.amount} placeholder={c('limits.none')} disabled={!p.canEdit || busy} onChange={(e) => set(r.key, { amount: e.target.value })} aria-label={`${r.nameEn}: ${c('limits.maxAmount')}`} />
                    </td>
                    <td className="r">
                      <input className="a2-inp" inputMode="decimal" style={{ width: 80, textAlign: 'right' }} value={d.pct} placeholder={c('limits.none')} disabled={!p.canEdit || busy} onChange={(e) => set(r.key, { pct: e.target.value })} aria-label={`${r.nameEn}: ${c('limits.maxPct')}`} />
                    </td>
                    <td>{ex.length ? ex.map((k) => <span key={k} className="s28-chip" style={{ marginRight: 4 }}>{c(`export.${k}`)}</span>) : c('limits.exportNone')}</td>
                    <td>
                      <input type="checkbox" checked={d.hide} disabled={!p.canEdit || busy} onChange={(e) => set(r.key, { hide: e.target.checked })} aria-label={`${r.nameEn}: ${c('limits.hide')}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('limits.hint')} {c('limits.ownerNote')}</p>
        <div className="s28-row a2-mt12">
          <label className="s28-row"><input type="checkbox" checked={on} disabled={!p.canEdit || busy} onChange={(e) => setOn(e.target.checked)} data-testid="handover-on" /> {c('handover.on')}</label>
          <input className="a2-inp" type="time" value={time} disabled={!p.canEdit || busy} onChange={(e) => setTime(e.target.value)} aria-label={c('handover.time')} style={{ maxWidth: 130 }} />
        </div>
        {p.canEdit ? (
          <div className="s28-row a2-mt12">
            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pin} placeholder={c('limits.pin')} onChange={(e) => setPin(e.target.value)} aria-label={c('limits.pin')} style={{ maxWidth: 160 }} data-testid="staff-pin" />
            <button type="button" className="a2-btn" disabled={busy} onClick={save} data-testid="staff-save">{busy ? c('limits.saving') : c('limits.save')}</button>
          </div>
        ) : null}
        {said ? <p className={`a2-sm a2-mt6 ${said.bad ? 's28-bad' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'}>{said.text}</p> : null}
      </section>

      {p.canMakeRole ? (
        <section className="a2-card a2-mt12" data-testid="packer-card">
          <h2 className="a2-h3">{c('limits.packerTitle')}</h2>
          <p className="a2-cs">{c('limits.packerText')}</p>
          {p.view.hasPackerRole ? <p className="a2-sm a2-mute a2-mt6">{c('limits.packerHave')}</p> : <button type="button" className="a2-btn a2-mt12" disabled={busy} onClick={makePacker}>{c('limits.packerMake')}</button>}
        </section>
      ) : null}

      <section className="a2-card a2-mt12" data-testid="handover-card">
        <h2 className="a2-h3">{c('handover.title')}</h2>
        <p className="a2-cs">{c('handover.sub')}</p>
        {!p.view.handover.enabled ? (
          <p className="a2-sm a2-mute a2-mt12">{c('handover.off')}</p>
        ) : (
          <div className="s28-row a2-mt12">
            <input className="a2-inp" type="date" max={p.today} value={day} onChange={(e) => setDay(e.target.value)} aria-label={c('handover.day')} />
            <select className="a2-sel" value={method} onChange={(e) => setMethod(e.target.value as 'CASH' | 'WALLET')} aria-label={c('handover.method')}>
              <option value="CASH">{c('handover.CASH')}</option>
              <option value="WALLET">{c('handover.WALLET')}</option>
            </select>
            <input className="a2-inp" inputMode="decimal" value={counted} placeholder={c('handover.counted')} onChange={(e) => setCounted(e.target.value)} aria-label={c('handover.counted')} style={{ maxWidth: 140 }} data-testid="handover-counted" />
            <input className="a2-inp" maxLength={300} value={note} placeholder={c('handover.note')} onChange={(e) => setNote(e.target.value)} aria-label={c('handover.note')} />
            <button type="button" className="a2-btn" disabled={busy} onClick={hand} data-testid="handover-write">{c('handover.write')}</button>
          </div>
        )}
        <div className="s28-tw a2-mt12">
          {p.sheet.rows.length === 0 ? (
            <p className="a2-sm a2-mute">{c('handover.empty')}</p>
          ) : (
            <table className="s28-tbl" data-testid="handover-sheet">
              <thead>
                <tr>
                  <th>{c('handover.who')}</th>
                  <th>{c('handover.method')}</th>
                  <th className="r">{c('handover.expected')}</th>
                  <th className="r">{c('handover.counted')}</th>
                  <th>{c('handover.difference')}</th>
                </tr>
              </thead>
              <tbody>
                {p.sheet.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{p.sheet.names[r.staffUserId] || '—'}</td>
                    <td>{c(`handover.${r.method}`)}</td>
                    <td className="r">{m(r.expectedMinor)}</td>
                    <td className="r">{m(r.countedMinor)}</td>
                    <td>{diff(r.differenceMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('handover.history')}</p>
      </section>
    </>
  );
}
