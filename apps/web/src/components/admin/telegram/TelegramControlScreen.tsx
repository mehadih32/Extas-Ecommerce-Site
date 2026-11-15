'use client';
// PR 861 (prototype v5 Settings › Telegram control) — the half above "Urgent approvals on Telegram": the daily business report card,
// the alerts card, the allowed Telegram accounts (a phone is added with a pairing code and removed with the owner's PIN) and the
// commands the bot knows. Every switch saves at once through POST /api/admin/telegram-control/save (owner only, lib/telegram-control.ts).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { typedMinor } from '@/lib/admin-books/money';
import { call, errorText } from '../api';
import { showToast } from '../lumen/Toast';
import { formatMoney, type Money } from '../products/model';
import { ConfirmDialog } from '../settings/ConfirmDialog';
import { LmSwitch } from '../settings/LmSwitch';
import type { ControlView } from '@/lib/telegram-control';

const API = '/api/admin/telegram-control';
const ALERTS = ['down', 'backup', 'bigOrder', 'erp', 'login'] as const;
const COMMANDS = ['report', 'orders', 'stock', 'pause', 'ai', 'ask'] as const;

export interface TelegramControlProps {
  dict: Dict;
  view: ControlView;
  /** The store's money: the big-order line is typed in whole money. */
  money: Money;

  /** How long a pairing code works (the server's PAIR_MINUTES). */
  pairMinutes: number;
}

export function TelegramTestButton({ dict }: { dict: Dict }) {
  const [busy, setBusy] = useState(false);
  const c = (k: string) => t(dict, `telegramControl.${k}`);
  return (
    <button
      type="button"
      className="a2-btn"
      disabled={busy}
      data-testid="tg-test"
      onClick={async () => {
        setBusy(true);
        const a = await call('POST', `${API}/test`, { text: c('testLine') });
        setBusy(false);
        showToast(a.data.ok ? { text: c('testSent'), tone: 'ok' } : { text: errorText(dict, a), tone: 'bad' });
      }}
    >
      {c('test')}
    </button>
  );
}

export function TelegramControlScreen({ dict, view, money, pairMinutes }: TelegramControlProps) {
  const router = useRouter();
  const c = (k: string, v?: Record<string, string | number>) => t(dict, `telegramControl.${k}`, v);
  const moneyText = (m: number) => formatMoney(m, money);
  const [time, setTime] = useState(view.reportTime);
  const [over, setOver] = useState(String(view.bigOrderOverMinor / 10 ** money.digits));
  const [preview, setPreview] = useState<string | null>(null);
  const [ask, setAsk] = useState<null | { kind: 'pair' } | { kind: 'remove'; id: string; who: string }>(null);
  const [code, setCode] = useState<string | null>(null);

  async function save(change: Record<string, unknown>) {
    const a = await call('POST', `${API}/save`, change);
    showToast(a.data.ok ? { text: c('saved'), tone: 'ok' } : { text: errorText(dict, a), tone: 'bad' });
    router.refresh();
  }
  async function showPreview() {
    const a = await call('GET', `${API}/preview`);
    if (!a.data.ok) return showToast({ text: errorText(dict, a), tone: 'bad' });
    const d = a.data as unknown as { date: string; time: string; orders: number; salesMinor: number; orderedMinor: number; waiting: number };
    setPreview([`${d.date} ${d.time}`, `${c('pv.orders')}: ${d.orders} · ${c('pv.sales')} ${moneyText(d.salesMinor)}`, `${c('pv.ordered')}: ${moneyText(d.orderedMinor)}`, `${c('pv.waiting')}: ${d.waiting}`].join('\n'));
  }

  if (!view.isOwner) return null;
  const alertLabel = (a: (typeof ALERTS)[number]) => (a === 'bigOrder' ? c('alert.bigOrder', { amount: moneyText(view.bigOrderOverMinor) }) : c(`alert.${a}`));
  return (
    <>
      <div className="s28-grid" data-testid="tg-control">
        <section className="a2-card" data-testid="tg-report" aria-labelledby="tg-report-h">
          <h2 className="a2-h3" id="tg-report-h">{c('report.h')}</h2>
          <div className="s28-row between a2-mt12">
            <div className="s28-grow">
              <b>{c('report.every', { time: view.reportTime })}</b>
              <div className="a2-xs a2-mute">{c('report.what')}</div>
            </div>
            <LmSwitch testId="tg-rep" on={view.reportOn} label={c('report.every', { time: view.reportTime })} onFlip={(v) => save({ reportOn: v })} />
          </div>
          <label className="a2-lbl a2-mt12" htmlFor="tg-time">{c('report.time')}</label>
          <input id="tg-time" className="a2-inp" type="time" value={time} style={{ maxWidth: 160 }} onChange={(e) => setTime(e.target.value)} onBlur={() => time && time !== view.reportTime && save({ reportTime: time })} data-testid="tg-time" />
          <label className="a2-chkl s28-row a2-mt12"><input type="checkbox" checked={view.emailOn} onChange={(e) => save({ emailOn: e.target.checked })} data-testid="tg-mail" /> {c('report.email')}</label>
          <label className="a2-chkl s28-row a2-mt6"><input type="checkbox" checked={view.weeklyAudit} onChange={(e) => save({ weeklyAudit: e.target.checked })} data-testid="tg-week" /> {c('report.weekly')}</label>
          <div className="a2-mt12"><button type="button" className="a2-btn sm" onClick={showPreview} data-testid="tg-prev">{c('report.preview')}</button></div>
          {preview ? <pre className="a2-sm a2-mt12" style={{ whiteSpace: 'pre-wrap' }} aria-label={c('report.previewTitle')} data-testid="tg-preview">{preview}</pre> : null}
        </section>

        <section className="a2-card" data-testid="tg-alerts" aria-labelledby="tg-alerts-h">
          <h2 className="a2-h3" id="tg-alerts-h">{c('alerts.h')}</h2>
          <ul className="s28-list">
            {ALERTS.map((a) => (
              <li key={a} className="s28-row between" style={{ alignItems: 'center' }}>
                <span className="s28-grow">{alertLabel(a)}</span>
                <LmSwitch testId={`tg-al-${a}`} on={view.alerts[a]} label={alertLabel(a)} onFlip={(v) => save({ alerts: { [a]: v } })} />
              </li>
            ))}
          </ul>
          <label className="a2-lbl a2-mt12" htmlFor="tg-over">{c('alerts.over')}</label>
          <input
            id="tg-over"
            className="a2-inp"
            inputMode="decimal"
            value={over}
            style={{ maxWidth: 160 }}
            onChange={(e) => setOver(e.target.value)}
            onBlur={() => {
              const m = typedMinor(over, money.digits);
              if (m === null) return showToast({ text: c('errors.INVALID_INPUT'), tone: 'bad' });
              if (m !== view.bigOrderOverMinor) void save({ bigOrderOverMinor: m });
            }}
            data-testid="tg-over"
          />
          <div className="a2-xs a2-mute">{c('alerts.overHelp')}</div>
        </section>

        <section className="a2-card" data-testid="tg-accounts" aria-labelledby="tg-acc-h">
          <h2 className="a2-h3" id="tg-acc-h">{c('accounts.h')}</h2>
          <ul className="s28-list">
            {view.ownerChat ? (
              <li className="s28-row between" style={{ alignItems: 'center' }}>
                <div className="s28-grow"><b>{c('accounts.you')}</b> <span className="a2-pill line">{c('accounts.owner')}</span><div className="a2-xs a2-mute">{view.ownerChat}</div></div>
              </li>
            ) : null}
            {view.accounts.map((x) => (
              <li key={x.id} className="s28-row between" style={{ alignItems: 'center' }} data-testid="tg-account">
                <div className="s28-grow"><b>{x.who}</b> <span className="a2-pill line">{x.role}</span><div className="a2-xs a2-mute">{x.id}</div></div>
                <button type="button" className="a2-btn sm" onClick={() => setAsk({ kind: 'remove', id: x.id, who: x.who })}>{c('accounts.remove')}</button>
              </li>
            ))}
            {!view.ownerChat && !view.accounts.length ? <li className="a2-sm a2-mute">{c('accounts.none')}</li> : null}
          </ul>
          <div className="a2-mt12">
            {code || view.pairUntil ? (
              <div className="a2-note" data-testid="tg-pair-note">
                <span>{code ? c('accounts.code', { code, minutes: String(pairMinutes) }) : c('accounts.codeWaiting')}</span>
              </div>
            ) : (
              <button type="button" className="a2-btn pri sm" onClick={() => setAsk({ kind: 'pair' })} data-testid="tg-pair">{c('accounts.pair')}</button>
            )}
          </div>
          <p className="a2-xs a2-mute a2-mt6">{c('accounts.hint')}</p>
        </section>

        <section className="a2-card" data-testid="tg-commands" aria-labelledby="tg-cmd-h">
          <h2 className="a2-h3" id="tg-cmd-h">{c('commands.h')}</h2>
          <ul className="s28-list">
            {COMMANDS.map((k) => (
              <li key={k} className="s28-row">
                <code style={{ minWidth: 110 }}>{c(`commands.${k}.cmd`)}</code>
                <span className="s28-grow">{c(`commands.${k}.what`)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {ask ? (
        <ConfirmDialog
          testId="tg-pin"
          tone={ask.kind === 'remove' ? 'badf' : 'pri'}
          texts={{
            title: ask.kind === 'pair' ? c('pin.pairTitle') : c('pin.removeTitle'),
            effects: [ask.kind === 'pair' ? c('pin.pairText', { minutes: String(pairMinutes) }) : c('pin.removeText', { who: ask.who })],
            reason: null,
            cancel: c('cancel'),
            ok: ask.kind === 'pair' ? c('pin.pairOk') : c('accounts.remove'),
            working: c('working'),
            close: c('cancel'),
            pin: c('pin.label'),
          }}
          onClose={() => setAsk(null)}
          onConfirm={async (_r, pin) => {
            if (!pin) return c('errors.PIN_REQUIRED');
            const a = ask.kind === 'pair' ? await call('POST', `${API}/pair`, { pin }) : await call('POST', `${API}/remove`, { id: ask.id, pin });
            if (!a.data.ok) return errorText(dict, a);
            if (ask.kind === 'pair') setCode(String(a.data.code ?? ''));
            showToast({ text: ask.kind === 'pair' ? c('pairMade') : c('removed'), tone: 'ok' });
            setAsk(null);
            router.refresh();
            return null;
          }}
        />
      ) : null}
    </>
  );
}
