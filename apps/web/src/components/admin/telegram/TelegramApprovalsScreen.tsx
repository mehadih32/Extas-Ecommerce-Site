'use client';
// S28 · PR 703 — Settings → Telegram approvals: the settings card (switch, kinds, big COD line, minutes), the requests
// waiting for the owner (Approve or Reject with the PIN here, or on Telegram), the decided ones, the lock and "Connect the
// buttons". Writes go to /api/admin/telegram-approvals/*; every one needs the owner's PIN.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { typedMinor } from '@/lib/admin-books/money';
import type { ApprovalRow, ApprovalsView } from '@/lib/telegram-approvals';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { formatMoney, type Money } from '../products/model';

export interface TelegramApprovalsScreenProps {
  dict: Dict;
  money: Money;
  view: ApprovalsView;
}

export function TelegramApprovalsScreen(p: TelegramApprovalsScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `telegramApprovals.${k}`, vars);
  const m = (minor: number) => formatMoney(minor, p.money);
  const digits = p.money.digits;
  const cfg = p.view.cfg;
  const [on, setOn] = useState(cfg.enabled);
  const [refund, setRefund] = useState(cfg.refund);
  const [price, setPrice] = useState(cfg.price);
  const [cash, setCash] = useState(cfg.cash);
  const [cod, setCod] = useState(cfg.cod);
  const [codOver, setCodOver] = useState(String(cfg.codOverMinor / 10 ** digits));
  const [wait, setWait] = useState(String(cfg.waitMinutes));
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [deciding, setDeciding] = useState<{ row: ApprovalRow; decision: 'approve' | 'reject' } | null>(null);
  const [decidePin, setDecidePin] = useState('');
  const [example, setExample] = useState(false);

  const err = (a: { status: number; data: { error?: string } }) => {
    const k = `telegramApprovals.errors.${a.status === 0 ? 'network' : (a.data.error ?? 'server-error')}`;
    const v = t(p.dict, k);
    return v === k ? c('errors.server-error') : v;
  };
  async function post(path: string, body: unknown, okText: string) {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', `/api/admin/telegram-approvals${path}`, body);
    setBusy(false);
    if (a.data.ok) {
      showToast({ text: okText, tone: 'ok' });
      setSaid({ text: okText, bad: false });
      router.refresh();
      return true;
    }
    setSaid({ text: err(a), bad: true });
    return false;
  }
  const save = async () => {
    const over = typedMinor(codOver, digits);
    if (over === null) return setSaid({ text: c('errors.INVALID_INPUT'), bad: true });
    if (await post('/settings', { enabled: on, refund, price, cash, cod, codOverMinor: over, waitMinutes: Number(wait), pin }, c('card.saved'))) setPin('');
  };
  const decide = async () => {
    if (!deciding) return;
    if (await post(`/decide/${deciding.row.id}`, { decision: deciding.decision, pin: decidePin }, c('list.confirm'))) {
      setDeciding(null);
      setDecidePin('');
    }
  };

  if (!p.view.isOwner) return <p className="a2-sm a2-mt12" data-testid="telegram-owner-only">{c('owner')}</p>;
  const line = (r: ApprovalRow) => `${c(`list.kind.${r.kind}`)} · ${r.title}${r.amountMinor !== null ? ` · ${m(r.amountMinor)}` : ''}`;
  return (
    <>
      <p className="a2-sm a2-mt12" data-testid="telegram-mode">{c(`mode.${p.view.mode === 'LIVE' ? 'LIVE' : 'MOCK'}`)}</p>
      {cfg.lockedAt ? (
        <section className="a2-card a2-mt12" data-testid="telegram-locked">
          <p className="s28-bad a2-sm">{c('lock.locked')}</p>
          <div className="s28-row a2-mt6">
            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pin} placeholder={c('card.pin')} aria-label={c('card.pin')} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 160 }} />
            <button type="button" className="a2-btn" disabled={busy || !pin.trim()} onClick={async () => { if (await post('/unlock', { pin }, c('lock.unlocked'))) setPin(''); }}>{c('lock.unlock')}</button>
          </div>
        </section>
      ) : null}

      <section className="a2-card a2-mt12" aria-labelledby={`${id}-s`} data-testid="telegram-settings">
        <h2 className="a2-h3" id={`${id}-s`}>{c('card.title')}</h2>
        <label className="a2-chkl s28-row a2-mt6"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} data-testid="telegram-on" /> <b>{c('card.on')}</b></label>
        <p className="a2-xs a2-mute">{c('card.help')}</p>
        <div className="s28-list a2-mt6">
          <label className="a2-chkl s28-row"><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> {c('card.refund')}</label>
          <label className="a2-chkl s28-row"><input type="checkbox" checked={price} onChange={(e) => setPrice(e.target.checked)} /> {c('card.price')}</label>
          <label className="a2-chkl s28-row"><input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} /> {c('card.cash')}</label>
          <label className="a2-chkl s28-row"><input type="checkbox" checked={cod} onChange={(e) => setCod(e.target.checked)} /> {c('card.cod')}</label>
        </div>
        <div className="s28-row a2-mt12">
          <label>{c('card.codOver')}<input className="a2-inp" inputMode="decimal" value={codOver} style={{ width: 120 }} onChange={(e) => setCodOver(e.target.value)} /></label>
          <label>{c('card.wait')}<input className="a2-inp" inputMode="numeric" value={wait} style={{ width: 90 }} onChange={(e) => setWait(e.target.value)} /></label>
        </div>
        <p className="a2-xs a2-mute">{c('card.wait2')}</p>
        <div className="s28-row a2-mt12">
          <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pin} placeholder={c('card.pin')} aria-label={c('card.pin')} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 160 }} data-testid="telegram-pin" />
          <button type="button" className="a2-btn" disabled={busy || !pin.trim()} onClick={save} data-testid="telegram-save">{c('card.save')}</button>
          <button type="button" className="a2-btn" disabled={busy || !pin.trim()} onClick={() => post('/connect', { pin }, c('card.connected'))}>{c('card.connect')}</button>
          <button type="button" className="a2-btn" onClick={() => setExample((v) => !v)}>{c('example.button')}</button>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('card.note')} {c('lock.wrong', { n: p.view.wrongPinsToday })}</p>
        {example ? <pre className="a2-sm a2-mt6" style={{ whiteSpace: 'pre-wrap' }} aria-label={c('example.title')}>{c('example.text')}</pre> : null}
      </section>

      <section className="a2-card a2-mt12" data-testid="telegram-pending">
        <h2 className="a2-h3">{c('list.pending')}</h2>
        <div className="s28-list a2-mt6">
          {p.view.pending.length ? p.view.pending.map((r) => (
            <div key={r.id} className="s28-row" data-testid="telegram-request">
              <span className="grow">{line(r)}{r.askedOnTelegram ? <span className="a2-xs a2-mute"> · {c('list.asked')}</span> : null}</span>
              <button type="button" className="a2-btn" onClick={() => setDeciding({ row: r, decision: 'approve' })}>{c('list.approve')}</button>
              <button type="button" className="a2-btn" onClick={() => setDeciding({ row: r, decision: 'reject' })}>{c('list.reject')}</button>
            </div>
          )) : <p className="a2-sm a2-mute">{c('list.none')}</p>}
        </div>
        {deciding ? (
          <div className="s28-row a2-mt12" role="dialog" aria-label={c('list.typePin', { what: line(deciding.row) })}>
            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={decidePin} placeholder={c('card.pin')} aria-label={c('card.pin')} onChange={(e) => setDecidePin(e.target.value)} style={{ maxWidth: 160 }} data-testid="telegram-decide-pin" />
            <button type="button" className="a2-btn" disabled={busy || !decidePin.trim()} onClick={decide} data-testid="telegram-decide-ok">{c('list.confirm')}</button>
            <button type="button" className="a2-btn" onClick={() => setDeciding(null)}>{c('list.cancel')}</button>
          </div>
        ) : null}
      </section>

      <section className="a2-card a2-mt12" data-testid="telegram-recent">
        <h2 className="a2-h3">{c('list.recent')}</h2>
        <div className="s28-list a2-mt6">
          {p.view.recent.length ? p.view.recent.map((r) => (
            <div key={r.id} className="s28-row">
              <span className="grow">{line(r)}</span>
              <span className={r.status === 'APPROVED' ? 's28-good' : 's28-warn'}>{c(`list.status.${r.status}`)}</span>
              <span className="a2-xs a2-mute">{r.decidedVia ? c(`list.via.${r.decidedVia}`) : ''}</span>
            </div>
          )) : <p className="a2-sm a2-mute">{c('list.noneRecent')}</p>}
        </div>
      </section>
      {said ? <p className={`a2-sm a2-mt6 ${said.bad ? 's28-bad' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'}>{said.text}</p> : null}
    </>
  );
}
