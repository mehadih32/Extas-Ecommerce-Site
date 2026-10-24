// S14 · PR 291 (and PR 149's log) — Messages → Message log (MSG-04, ADMIN-ARCHITECTURE §4.6; demo V12.4
// #/admin/messages/log): every message the shop meant to send, newest first — when, which step, the channel, to whom,
// its state and why (skipped, stopped by a limit, waiting for quiet hours), the SMS parts it took, what it cost, and
// when the provider said it reached the phone. The counts per state on top; filters by state, channel and order; a
// failed message can be tried again once more by a person with `messages.log.retry`. Seeing needs `messages.log.view`
// (the recipient is personal data). A message sent in practice mode says "would send": nothing left the server.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as ms from '@extas/messages';
import { MESSAGE_CHANNELS } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { MsgAct } from '@/components/admin/messages/MsgAct';
import { formatNumber } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { label, moneyText, withMessages } from '@/lib/admin-messages/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { messagesDeps } from '@/lib/messages-api';

export const dynamic = 'force-dynamic';

const HERE = '/admin/messages/log';
const KEY = 'messagesLog';
const STATUSES = ['FAILED', 'QUEUED', 'SENT', 'DELIVERED', 'SKIPPED', 'BLOCKED_BY_GUARD'] as const;
const KPIS: [string, (typeof STATUSES)[number]][] = [
  ['sent', 'SENT'],
  ['delivered', 'DELIVERED'],
  ['failed', 'FAILED'],
  ['skipped', 'SKIPPED'],
  ['blocked', 'BLOCKED_BY_GUARD'],
  ['queued', 'QUEUED'],
];
const TONE: Record<string, string> = { SENT: 'info', DELIVERED: 'ok', FAILED: 'bad', SKIPPED: 'line', BLOCKED_BY_GUARD: 'warn', QUEUED: 'gold' };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export async function generateMetadata(): Promise<Metadata> {
  const view = withMessages(await adminView());
  return { title: `${t(view.dict, 'msg.log.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MessageLogPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('messages.log.view', deps, MOTHER_STORE_ID)]);
  const view = withMessages(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="messages.log.view" />
      </div>
    );
  const status = STATUSES.find((s) => s === one(sp.status));
  const channel = MESSAGE_CHANNELS.find((c) => c === one(sp.channel));
  const orderNumber = one(sp.order)?.slice(0, 40);
  const cursor = one(sp.cursor);
  const query = { ...(status ? { status } : {}), ...(channel ? { channel } : {}), ...(orderNumber ? { orderNumber } : {}), ...(cursor && /^[0-9a-f-]{36}$/i.test(cursor) ? { cursor } : {}) };
  const who: ms.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const [log, currency] = await Promise.all([ms.messageLog(await messagesDeps(access.deps), who, query), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>]);
  const canRetry = access.guard.permissions?.has('messages.log.retry') ?? false;
  const md: Dict = { msg: d.msg as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' });
  const filtered = Boolean(status || channel || orderNumber);
  const keep = (more: Record<string, string>) => {
    const q = new URLSearchParams({ ...(status ? { status } : {}), ...(channel ? { channel } : {}), ...(orderNumber ? { order: orderNumber } : {}), ...more });
    const s = q.toString();
    return s ? `${HERE}?${s}` : HERE;
  };
  const col = (k: string) => t(d, `msg.log.col.${k}`);

  return (
    <div className="a2-z" data-testid="messages-log">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'msg.log.title')} sub={t(d, 'msg.log.sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-kpis k6 a2-mt12" data-testid="log-counts">
        {KPIS.map(([k, s]) => (
          <Link key={k} className="a2-card a2-kpi" href={`${HERE}?status=${s}`} aria-current={status === s ? 'true' : undefined}>
            <div className="a2-kl">{t(d, `msg.log.kpi.${k}`)}</div>
            <div className="a2-kv">{n(log.counts[s])}</div>
          </Link>
        ))}
      </div>
      <form className="a2-fbar a2-mt12" action={HERE} method="get" role="search" aria-label={t(d, 'msg.log.title')} data-testid="log-filters">
        <span className="a2-fsel">
          <label className="a2-sr" htmlFor="ml-status">
            {t(d, 'msg.log.filter.status')}
          </label>
          <select id="ml-status" className="a2-sel" name="status" defaultValue={status ?? ''}>
            <option value="">
              {t(d, 'msg.log.filter.status')}: {t(d, 'msg.log.filter.all')}
            </option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(d, 'status', s)}
              </option>
            ))}
          </select>
        </span>
        <span className="a2-fsel">
          <label className="a2-sr" htmlFor="ml-channel">
            {t(d, 'msg.log.filter.channel')}
          </label>
          <select id="ml-channel" className="a2-sel" name="channel" defaultValue={channel ?? ''}>
            <option value="">
              {t(d, 'msg.log.filter.channel')}: {t(d, 'msg.log.filter.all')}
            </option>
            {MESSAGE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {label(d, 'channel', c)}
              </option>
            ))}
          </select>
        </span>
        <label className="a2-fsel">
          <span className="a2-sr">{t(d, 'msg.log.filter.order')}</span>
          <input className="a2-inp" type="search" name="order" defaultValue={orderNumber ?? ''} placeholder={t(d, 'msg.log.filter.order')} maxLength={40} autoComplete="off" />
        </label>
        <button type="submit" className="a2-btn">
          {t(d, 'msg.log.filter.apply')}
        </button>
        {filtered ? (
          <Link className="a2-btn ghost" href={HERE}>
            {t(d, 'msg.log.filter.clear')}
          </Link>
        ) : null}
      </form>
      {log.rows.length ? (
        <div className="a2-tblw" data-testid="log-table">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{col('message')}</th>
                <th>{col('to')}</th>
                <th>{col('state')}</th>
                <th>{col('why')}</th>
                <th className="r">{col('cost')}</th>
              </tr>
            </thead>
            <tbody>
              {log.rows.map((r) => (
                <tr key={r.id} data-testid="log-row" data-status={r.status}>
                  <td className="a2-tdh">
                    <div className="a2-cell">
                      <b>
                        {label(d, 'step', r.step) || t(d, 'msg.log.noOrder')} · {label(d, 'channel', r.channel)}
                      </b>
                      <span>
                        {r.order ? (
                          <Link className="a2-lnk" href={`/admin/orders/${r.order.id}`}>
                            {r.order.number}
                          </Link>
                        ) : null}
                        {r.order ? ' · ' : ''}
                        {when.format(new Date(r.createdAt))}
                      </span>
                    </div>
                  </td>
                  <td data-l={col('to')}>
                    <span className="a2-mono a2-nowrap">{r.recipient || t(d, 'msg.none')}</span>
                  </td>
                  <td data-l={col('state')}>
                    <div className="a2-cell">
                      <span>
                        <span className={`a2-pill ${TONE[r.status] ?? 'line'}`}>{label(d, 'status', r.status)}</span>
                        {r.mode === 'MOCK' && (r.status === 'SENT' || r.status === 'DELIVERED') ? <span className="a2-xs a2-faint"> {t(d, 'msg.wouldSend')}</span> : null}
                      </span>
                      {r.deliveredAt ? <span className="a2-xs">{t(d, 'msg.log.delivered', { at: when.format(new Date(r.deliveredAt)) })}</span> : null}
                      {r.segments ? <span className="a2-xs a2-mute">{t(d, 'msg.log.parts', { n: n(r.segments) })}</span> : null}
                      {r.attempts > 1 ? <span className="a2-xs a2-mute">{t(d, 'msg.log.tries', { n: n(r.attempts) })}</span> : null}
                    </div>
                  </td>
                  <td className="a2-tdw" data-l={col('why')}>
                    <div className="a2-cell">
                      {r.reason ? <span>{label(d, 'reason', r.reason)}</span> : <span className="a2-faint">{t(d, 'msg.none')}</span>}
                      {r.error && r.status === 'FAILED' ? <span className="a2-xs a2-mute a2-ell">{r.error}</span> : null}
                      {canRetry && r.status === 'FAILED' && r.order ? (
                        <MsgAct dict={md} url={`/api/admin/messages/log/${r.id}/retry`} label={t(d, 'msg.log.retry')} busyLabel={t(d, 'msg.log.retrying')} outcomeOf="retry" done={{ SENT: t(d, 'msg.log.retried'), ok: t(d, 'msg.log.retryFailed') }} testId="log-retry" />
                      ) : null}
                    </div>
                  </td>
                  <td className="r" data-l={col('cost')}>
                    <span className="a2-num">{r.costMinor !== null ? moneyText(r.costMinor, view.locale, currency) : t(d, 'msg.none')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="a2-card a2-mt12" data-testid="log-empty">
          <p className="a2-sm a2-mute">{t(d, filtered ? 'msg.log.emptyFiltered' : 'msg.log.empty')}</p>
        </section>
      )}
      <div className="a2-gap8 a2-mt12">
        {cursor ? (
          <Link className="a2-btn ghost" href={keep({})}>
            {t(d, 'msg.log.newest')}
          </Link>
        ) : null}
        {log.next ? (
          <Link className="a2-btn" href={keep({ cursor: log.next })} data-testid="log-older">
            {t(d, 'msg.log.older')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
