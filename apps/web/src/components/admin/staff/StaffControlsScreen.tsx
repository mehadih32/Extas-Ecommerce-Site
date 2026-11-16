'use client';
// S28 · PR 702 — Settings → Staff controls: the limits table (discount in Tk and percent, the export rows read-only,
// hide phone and address), the packer role, and the end-of-day cash / bKash handover sheet. Writes go to
// /api/admin/staff-controls/*; the limits need the owner's PIN. Nothing here moves money.
// PR 1020 (D12, owner order: the real admin equals prototype v5 100%): now the two lower cards of Settings › Team & roles, drawn as
// the prototype draws them (m-settings.js `teamExtra`): "Staff limits" (Role, Max discount %, Can export, Hide phone & address,
// Undo / Save limits with the PIN) and "End-of-day cash & bKash handover" (the switch and time, who is short, the table with
// Record, Download today's sheet). What the real page has beyond that (the discount in Tk, the export rows in words, the packer
// role, the record form for any day with a note, the history rule) sits in a collapsed "More options" in the same card.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { t, type Dict } from '@/lib/i18n';
import { typedMinor } from '@/lib/admin-books/money';
import type { HandoverRow, StaffControlsView } from '@/lib/staff-controls';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { useDialogKeys } from '../orders/OrderCommands';
import { formatMoney, type Money } from '../products/model';
import { ConfirmDialog } from '../settings/ConfirmDialog';
import { ShellIcon } from '../shell/ShellIcon';

/** One desk staff member for today: what the shop's own payments say they took, and what they handed over so far. */
export interface DeskRow {
  id: string;
  name: string;
  roleName: string;
  expectedCash: number;
  expectedWallet: number;
  got: { CASH: number | null; WALLET: number | null };
}

export interface StaffControlsScreenProps {
  dict: Dict;
  money: Money;
  view: StaffControlsView;
  canEdit: boolean;
  canMakeRole: boolean;
  canManage: boolean;
  day: string;
  today: string;
  sheet: { rows: HandoverRow[]; names: Record<string, string> };
  desk: DeskRow[];
  exportKeys: readonly string[];
}

interface Draft {
  amount: string;
  pct: string;
  hide: boolean;
}

const noSubscribe = () => () => {};

function Switch({ on, label, disabled, onChange, testId }: { on: boolean; label: string; disabled?: boolean; onChange?: (v: boolean) => void; testId?: string }) {
  return <button type="button" className={`a2-sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled || !onChange} onClick={() => onChange?.(!on)} data-testid={testId} />;
}

export function StaffControlsScreen(p: StaffControlsScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `staffControls.${k}`, vars);
  const tm = (k: string, vars?: Record<string, string | number>) => t(p.dict, `people.team.${k}`, vars);
  const m = (minor: number) => formatMoney(minor, p.money);
  const unit = 10 ** p.money.digits;
  const fresh = (): Record<string, Draft> => Object.fromEntries(p.view.roles.map((r) => [r.key, { amount: r.limit.maxDiscountMinor === null ? '' : String(r.limit.maxDiscountMinor / unit), pct: r.limit.maxDiscountPct === null ? '' : String(r.limit.maxDiscountPct), hide: r.limit.hideContact }]));
  const [draft, setDraft] = useState<Record<string, Draft>>(fresh);
  const [dirty, setDirty] = useState(false);
  const [on, setOn] = useState(p.view.handover.enabled);
  const [time, setTime] = useState(p.view.handover.time);
  const [ask, setAsk] = useState<'limits' | 'handover' | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [day, setDay] = useState(p.day);
  const [method, setMethod] = useState<'CASH' | 'WALLET'>('CASH');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [rec, setRec] = useState<DeskRow | null>(null);

  const roles = p.view.roles.filter((r) => r.key !== 'owner');
  const set = (key: string, patch: Partial<Draft>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, [key]: { ...d[key]!, ...patch } }));
  };

  const err = (a: { status: number; data: { error?: string } }) => {
    const k = `staffControls.errors.${a.status === 0 ? 'network' : (a.data.error ?? 'server-error')}`;
    const v = t(p.dict, k);
    return v === k ? c('errors.server-error') : v;
  };
  /** The limits as the server stores them (a role with nothing set is not listed); null when a number is not valid. */
  function limitsOf(src: Record<string, Draft>) {
    const limits: Record<string, { maxDiscountMinor: number | null; maxDiscountPct: number | null; hideContact: boolean }> = {};
    for (const r of roles) {
      const d = src[r.key]!;
      const minor = d.amount.trim() === '' ? null : typedMinor(d.amount, p.money.digits);
      const pct = d.pct.trim() === '' ? null : Number(d.pct);
      if ((d.amount.trim() !== '' && minor === null) || (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100))) return null;
      if (minor === null && pct === null && !d.hide) continue;
      limits[r.key] = { maxDiscountMinor: minor, maxDiscountPct: pct, hideContact: d.hide };
    }
    return limits;
  }
  /** Saves with the owner's PIN. The handover switch is saved with the limits that are already saved, never with unsaved edits. */
  async function save(pin: string, what: 'limits' | 'handover'): Promise<string | null> {
    const limits = limitsOf(what === 'limits' ? draft : fresh());
    if (!limits) return c('errors.INVALID_INPUT');
    const a = await call('POST', '/api/admin/staff-controls', { limits, handover: what === 'limits' ? { enabled: p.view.handover.enabled, time: p.view.handover.time } : { enabled: on, time }, pin });
    if (a.status !== 200) return err(a);
    setAsk(null);
    if (what === 'limits') setDirty(false);
    showToast({ text: c('limits.saved'), tone: 'ok' });
    router.refresh();
    return null;
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
  async function record(who: DeskRow, cash: string, wallet: string): Promise<boolean> {
    const parts: [('CASH' | 'WALLET'), string][] = [['CASH', cash], ['WALLET', wallet]];
    for (const [meth, raw] of parts) {
      const minor = typedMinor(raw, p.money.digits);
      if (minor === null) {
        setSaid({ text: c('errors.INVALID_INPUT'), bad: true });
        return false;
      }
      const a = await call('POST', '/api/admin/staff-controls/handover', { day: p.today, method: meth, countedMinor: minor, note: null, staffUserId: who.id });
      if (a.status !== 201) {
        setSaid({ text: err(a), bad: true });
        return false;
      }
    }
    showToast({ text: c('handover.written'), tone: 'ok' });
    router.refresh();
    return true;
  }
  const diff = (n: number) => (n === 0 ? <span className="s28-good">{c('handover.match')}</span> : n < 0 ? <span className="s28-bad">{c('handover.short')} {m(-n)}</span> : <span className="s28-warn">{c('handover.over')} {m(n)}</span>);

  const shortOnes = p.desk.filter((r) => (r.got.CASH !== null || r.got.WALLET !== null) && (r.got.CASH ?? 0) + (r.got.WALLET ?? 0) < r.expectedCash + r.expectedWallet);
  const sheetCsv = () => {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [[c('handover.who'), tm('handover.cash'), tm('handover.wallet'), tm('handover.expected'), tm('handover.handed')].map(q).join(',')];
    for (const r of p.desk) lines.push([r.name, r.expectedCash / unit, r.expectedWallet / unit, (r.expectedCash + r.expectedWallet) / unit, r.got.CASH === null && r.got.WALLET === null ? '' : ((r.got.CASH ?? 0) + (r.got.WALLET ?? 0)) / unit].map(q).join(','));
    const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `handover-${p.today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="a2-card a2-mt12" aria-labelledby={`${id}-l`} data-testid="staff-limits">
        <h2 className="a2-h4" id={`${id}-l`}>{c('limits.title')}</h2>
        <p className="a2-cs">{c('limits.sub')}</p>
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{c('limits.role')}</th>
                <th className="r">{tm('limits.maxDiscount')}</th>
                <th>{c('limits.export')}</th>
                <th>{c('limits.hide')}</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const d = draft[r.key]!;
                const ex = p.exportKeys.some((k) => r.exports[k as keyof typeof r.exports]);
                return (
                  <tr key={r.key} data-testid={`role-${r.key}`}>
                    <td data-l={c('limits.role')}><b>{r.nameEn}</b></td>
                    <td className="r" data-l={tm('limits.maxDiscount')}>
                      <input className="a2-inp" type="number" min={0} max={100} inputMode="decimal" style={{ width: 80, textAlign: 'right' }} value={d.pct} placeholder="0" disabled={!p.canEdit} onChange={(e) => set(r.key, { pct: e.target.value })} aria-label={`${r.nameEn}: ${tm('limits.maxDiscount')} %`} /> %
                    </td>
                    <td data-l={c('limits.export')}><Switch on={ex} label={`${r.nameEn}: ${c('limits.export')}`} /></td>
                    <td data-l={c('limits.hide')}><Switch on={d.hide} label={`${r.nameEn}: ${c('limits.hide')}`} disabled={!p.canEdit} onChange={(v) => set(r.key, { hide: v })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('limits.hint')}</p>
        {p.canEdit ? (
          <div className="s28-row a2-mt12" style={{ justifyContent: 'flex-end' }}>
            {dirty ? (
              <button type="button" className="a2-btn" onClick={() => { setDraft(fresh()); setDirty(false); }}>{tm('limits.undo')}</button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={!dirty} onClick={() => setAsk('limits')} data-testid="staff-save">{c('limits.save')}</button>
          </div>
        ) : null}
        {said ? <p className={`a2-sm a2-mt6 ${said.bad ? 's28-bad' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'}>{said.text}</p> : null}
        <details className="a2-more-opts a2-mt12" data-testid="staff-more">
          <summary><b>{tm('more.title')}</b> <span className="a2-xs a2-mute">{tm('limits.moreSub')}</span></summary>
          <div className="a2-tblw a2-mt6">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{c('limits.role')}</th>
                  <th className="r">{c('limits.maxAmount')}</th>
                  <th>{c('limits.export')}</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const d = draft[r.key]!;
                  const ex = p.exportKeys.filter((k) => r.exports[k as keyof typeof r.exports]);
                  return (
                    <tr key={r.key}>
                      <td data-l={c('limits.role')}>
                        <b>{r.nameEn}</b>
                        <div className="a2-xs a2-mute">{c('limits.people', { n: r.people })}</div>
                      </td>
                      <td className="r" data-l={c('limits.maxAmount')}>
                        <input className="a2-inp" inputMode="decimal" style={{ width: 110, textAlign: 'right' }} value={d.amount} placeholder={c('limits.none')} disabled={!p.canEdit} onChange={(e) => set(r.key, { amount: e.target.value })} aria-label={`${r.nameEn}: ${c('limits.maxAmount')}`} />
                      </td>
                      <td data-l={c('limits.export')}>{ex.length ? ex.map((k) => <span key={k} className="s28-chip" style={{ marginRight: 4 }}>{c(`export.${k}`)}</span>) : c('limits.exportNone')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="a2-xs a2-mute a2-mt6">{c('limits.ownerNote')} {tm('limits.exportNote')}</p>
          {p.canMakeRole ? (
            <div className="a2-mt12" data-testid="packer-card">
              <h3 className="a2-h4">{c('limits.packerTitle')}</h3>
              <p className="a2-cs">{c('limits.packerText')}</p>
              {p.view.hasPackerRole ? <p className="a2-sm a2-mute a2-mt6">{c('limits.packerHave')}</p> : <button type="button" className="a2-btn a2-mt12" disabled={busy} onClick={makePacker}>{c('limits.packerMake')}</button>}
            </div>
          ) : null}
        </details>
      </section>

      <section className="a2-card a2-mt12" data-testid="handover-card">
        <h2 className="a2-h4">{c('handover.title')}</h2>
        <p className="a2-cs">{p.today}</p>
        <div className="a2-swl a2-mt12">
          <span>
            <b>{tm('handover.ask', { time })}</b>
            <span className="a2-xs a2-mute" style={{ display: 'block' }}>{tm('handover.askSub')}</span>
          </span>
          <Switch on={on} label={tm('handover.ask', { time })} disabled={!p.canEdit} onChange={(v) => { setOn(v); setAsk('handover'); }} testId="handover-on" />
          <input className="a2-inp" type="time" value={time} disabled={!p.canEdit} onChange={(e) => setTime(e.target.value)} onBlur={() => (time !== p.view.handover.time && time ? setAsk('handover') : undefined)} aria-label={c('handover.time')} style={{ maxWidth: 130 }} />
        </div>
        {shortOnes.length ? (
          <div className="a2-note bad a2-mt12">
            <ShellIcon name="alert" size={16} />
            <div><b>{shortOnes.map((r) => r.name).join(', ')}</b> {tm('handover.short')}</div>
          </div>
        ) : null}
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl" data-testid="handover-sheet">
            <thead>
              <tr>
                <th>{tm('handover.staff')}</th>
                <th className="r a2-tdx">{tm('handover.cash')}</th>
                <th className="r a2-tdx">{tm('handover.wallet')}</th>
                <th className="r">{tm('handover.expected')}</th>
                <th className="r">{tm('handover.handed')}</th>
              </tr>
            </thead>
            <tbody>
              {p.desk.length === 0 ? (
                <tr><td colSpan={5}><span className="a2-sm a2-mute">{c('handover.empty')}</span></td></tr>
              ) : (
                p.desk.map((r) => {
                  const exp = r.expectedCash + r.expectedWallet;
                  const done = r.got.CASH !== null || r.got.WALLET !== null;
                  const got = (r.got.CASH ?? 0) + (r.got.WALLET ?? 0);
                  return (
                    <tr key={r.id}>
                      <td className="a2-tdh"><div className="a2-cell"><b>{r.name}</b><span>{r.roleName}</span></div></td>
                      <td className="r a2-tdx">{m(r.expectedCash)}</td>
                      <td className="r a2-tdx">{m(r.expectedWallet)}</td>
                      <td className="r" data-l={tm('handover.expected')}><b>{m(exp)}</b></td>
                      <td className="r" data-l={tm('handover.handed')}>
                        {done ? (
                          <>
                            {m(got)}
                            <div className="a2-xs">{diff(got - exp)}</div>
                          </>
                        ) : p.canManage && p.view.handover.enabled ? (
                          <button type="button" className="a2-btn sm" onClick={() => setRec(r)} data-testid={`handover-rec-${r.id}`}>{tm('handover.record')}</button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="s28-row a2-mt12" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="a2-btn" onClick={sheetCsv} data-testid="handover-dl">
            <ShellIcon name="dl" size={14} /> {tm('handover.download')}
          </button>
        </div>
        <details className="a2-more-opts a2-mt12" data-testid="handover-more">
          <summary><b>{tm('more.title')}</b> <span className="a2-xs a2-mute">{tm('handover.moreSub')}</span></summary>
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
          <div className="a2-tblw a2-mt12">
            {p.sheet.rows.length === 0 ? (
              <p className="a2-sm a2-mute">{c('handover.empty')}</p>
            ) : (
              <table className="a2-tbl">
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
                      <td data-l={c('handover.who')}>{p.sheet.names[r.staffUserId] || '—'}</td>
                      <td data-l={c('handover.method')}>{c(`handover.${r.method}`)}</td>
                      <td className="r" data-l={c('handover.expected')}>{m(r.expectedMinor)}</td>
                      <td className="r" data-l={c('handover.counted')}>{m(r.countedMinor)}</td>
                      <td data-l={c('handover.difference')}>{diff(r.differenceMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="a2-xs a2-mute a2-mt6">{c('handover.history')}</p>
        </details>
      </section>

      {ask ? (
        <ConfirmDialog
          testId="staff-pin"
          tone="pri"
          texts={{ title: ask === 'limits' ? tm('limits.pinTitle') : tm('handover.pinTitle'), effects: [ask === 'limits' ? tm('limits.pinText') : tm('handover.pinText')], reason: null, cancel: tm('invite.cancel'), ok: c('limits.save'), working: c('limits.saving'), close: tm('drawer.close'), pin: c('limits.pin') }}
          onClose={() => {
            setAsk(null);
            if (ask === 'handover') {
              setOn(p.view.handover.enabled);
              setTime(p.view.handover.time);
            }
          }}
          onConfirm={(_r, pin) => save(pin, ask)}
        />
      ) : null}
      {rec ? <RecordDialog dict={p.dict} who={rec} money={p.money} onClose={() => setRec(null)} onSave={async (cash, wallet) => { const ok = await record(rec, cash, wallet); if (ok) setRec(null); }} /> : null}
    </>
  );
}

type Settled = Promise<void>;

/** The prototype's "Record handover" window: who, what was expected, and the amount handed over (cash and bKash/Nagad each, starting from what was expected). */
function RecordDialog({ dict, who, money, onClose, onSave }: { dict: Dict; who: DeskRow; money: Money; onClose: () => void; onSave: (cash: string, wallet: string) => Settled }) {
  const tm = (k: string, vars?: Record<string, string | number>) => t(dict, `people.team.${k}`, vars);
  const unit = 10 ** money.digits;
  const box = useRef<HTMLDivElement>(null);
  const [cash, setCash] = useState(String(who.expectedCash / unit));
  const [wallet, setWallet] = useState(String(who.expectedWallet / unit));
  const [busy, setBusy] = useState(false);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  useDialogKeys(box, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className="adm2 a2-z a2-ov mid" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-label={tm('handover.recordTitle')} data-testid="handover-dlg">
        <div className="a2-dlgh">
          <h2 className="a2-h3">{tm('handover.recordTitle')}</h2>
          <button type="button" className="a2-icb" onClick={onClose} aria-label={tm('drawer.close')}>
            <ShellIcon name="x" size={18} />
          </button>
        </div>
        <div className="a2-dlgb">
          <p>
            {who.name} · {tm('handover.expected')} <b>{formatMoney(who.expectedCash + who.expectedWallet, money)}</b>
          </p>
          <div className="a2-fld a2-mt12">
            <label className="a2-lbl">{tm('handover.cashIn')}</label>
            <input className="a2-inp" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
          </div>
          <div className="a2-fld a2-mt12">
            <label className="a2-lbl">{tm('handover.walletIn')}</label>
            <input className="a2-inp" inputMode="decimal" value={wallet} onChange={(e) => setWallet(e.target.value)} />
          </div>
        </div>
        <div className="a2-dlgf">
          <button type="button" className="a2-btn" onClick={onClose}>{tm('invite.cancel')}</button>
          <button type="button" className="a2-btn pri" disabled={busy} onClick={async () => { setBusy(true); await onSave(cash, wallet); setBusy(false); }} data-testid="handover-dlg-ok">{tm('handover.save')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
