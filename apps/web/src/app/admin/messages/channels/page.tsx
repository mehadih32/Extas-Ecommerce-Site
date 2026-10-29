// S14 · PR 291 — Messages → Channels & limits (MSG-05, ADMIN-ARCHITECTURE §4.6; demo V12.4 #/admin/messages/channels):
// each channel's service (live, or its practice mode until the owner types a key in Settings → Keys & connections) with
// the credit left on the account and what it did in the last 7 days (sent, reached the phone, failed, cost); then one
// form for the master switch, the SMS sender name (masking) and its approval, what one SMS part costs, the caps per
// order and the quiet hours. Seeing needs `messages.channels.read`, saving `messages.channels.write` (the API checks it
// again). Nothing on this page sends a message.
// PR 292: the WhatsApp templates with Meta's word on each (approved, waiting, refused), read again (Sync) or one sent
// for approval; words WhatsApp would refuse are named so they can be changed first. A live WhatsApp the shop starts
// goes only as an approved template.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as ms from '@extas/messages';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ChannelsForm } from '@/components/admin/messages/ChannelsForm';
import { MsgAct } from '@/components/admin/messages/MsgAct';
import { formatNumber } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { label, moneyText, withMessages } from '@/lib/admin-messages/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { messagesDeps } from '@/lib/messages-api';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/messages/channels';
const KEY = 'messagesChannels';
const MODE_TONE: Record<string, string> = { MOCK: 'gold', SANDBOX: 'info', LIVE: 'ok' };
const WA_TONE: Record<string, string> = { APPROVED: 'ok', PENDING: 'warn', REJECTED: 'bad', PAUSED: 'warn', DISABLED: 'bad', none: 'line' };

export async function generateMetadata(): Promise<Metadata> {
  const view = withMessages(await adminView());
  return { title: `${t(view.dict, 'msg.channels.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ChannelsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('messages.channels.read', deps, MOTHER_STORE_ID)]);
  const view = withMessages(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="messages.channels.read" />
      </div>
    );
  const who: ms.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const md0 = await messagesDeps(access.deps);
  const [screen, wa, currency] = await Promise.all([ms.channelsScreen(md0, who), ms.waTemplatesScreen(md0, who), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>]);
  const md: Dict = { msg: d.msg as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  const x = (k: string, v: Record<string, string> = {}) => t(d, `msg.channels.${k}`, v);
  const w = (k: string, v: Record<string, string> = {}) => t(d, `msg.wa.${k}`, v);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' });
  // a practice sender's own words (msg.provider.*), else the service's name from Keys & connections, else its id
  const providerName = (p: string) => [`msg.provider.${p}`, `connections.${p}.name`].map((k) => [k, t(d, k)]).find(([k, v]) => k !== v)?.[1] ?? p;

  return (
    <div className="a2-z" data-testid="messages-channels">
      <PageHead view={view} place={locateKey(KEY)} title={x('title')} sub={x('sub')} />
      <SectionTabs view={view} current={KEY} />
      <section className="a2-sc a2-mt12" aria-labelledby="mc-prov" data-testid="channels-providers">
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id="mc-prov">
              {x('providers')}
            </h2>
            <p className="a2-scd">{x('providersHelp')}</p>
          </div>
          <Link className="a2-btn sm" href="/admin/integrations">
            {x('keys')}
            <ShellIcon name="cr" size={14} />
          </Link>
        </div>
        <div className="a2-stack a2-mt12" style={{ gap: 10 }}>
          {screen.channels.map((c) => (
            <div key={c.channel} className="a2-rule" data-testid="channel-row" data-channel={c.channel} data-mode={c.mode ?? 'none'}>
              <span>
                <b>{label(d, 'channel', c.channel)}</b>
                <span className="a2-xs a2-mute a2-blk">{c.provider ? x('provider', { name: providerName(c.provider) }) : x('noProvider')}</span>
                {c.balance ? (
                  <span className="a2-xs a2-blk" data-testid="channel-credit">
                    {x('credit', { amount: c.balance.amountMinor !== null ? moneyText(c.balance.amountMinor, view.locale, currency) : x('creditSms', { n: n(c.balance.count ?? 0) }) })}
                  </span>
                ) : null}
                {c.balanceError ? <span className="a2-xs a2-blk" style={{ color: 'var(--bad)' }}>{x('creditError', { why: c.balanceError })}</span> : null}
                <span className="a2-xs a2-mute a2-blk">
                  {x('week', { sent: n(c.week.sent), delivered: n(c.week.delivered), failed: n(c.week.failed) })}
                  {c.week.costMinor !== null ? ` · ${x('weekCost', { amount: moneyText(c.week.costMinor, view.locale, currency) })}` : ''}
                </span>
              </span>
              <span className={`a2-pill ${MODE_TONE[c.mode ?? ''] ?? 'line'}`} style={{ flex: '0 1 auto', maxWidth: '45%', whiteSpace: 'normal', textAlign: 'center' }}>
                {label(d, 'mode', c.mode ?? 'none')}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="a2-sc a2-mt12" aria-labelledby="mc-wa" data-testid="wa-templates" data-mode={wa.mode ?? 'none'}>
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id="mc-wa">
              {w('title')}
            </h2>
            <p className="a2-scd">{w('sub')}</p>
            <p className="a2-xs a2-mute">{wa.mode === 'LIVE' ? w('liveNote') : w('mockNote')}</p>
          </div>
          {wa.canSync && wa.perms.write ? <MsgAct dict={md} url="/api/admin/messages/whatsapp/templates/sync" label={w('sync')} busyLabel={w('syncing')} done={{ ok: w('synced') }} testId="wa-sync" /> : null}
        </div>
        {!wa.canSync ? <p className="a2-xs a2-mute a2-mt12">{w('noSync')}</p> : null}
        {wa.templates.length ? (
          <div className="a2-tblw a2-mt12" data-testid="wa-table">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{w('col.template')}</th>
                  <th>{w('col.status')}</th>
                  <th>{w('col.checked')}</th>
                </tr>
              </thead>
              <tbody>
                {wa.templates.map((tp) => {
                  const state = tp.providerStatus ?? 'none';
                  const canSubmit = wa.canSync && wa.perms.write && !tp.problems.length && state !== 'APPROVED' && state !== 'PENDING';
                  return (
                    <tr key={tp.id} data-testid="wa-row" data-status={state}>
                      <td className="a2-tdh">
                        <div className="a2-cell">
                          <b className="a2-mono">{tp.name}</b>
                          <span className="a2-xs a2-mute">
                            {w(`lang.${tp.locale === 'en' ? 'en' : 'bn'}`)} · {tp.language} · {w('values', { n: n(tp.values) })}
                          </span>
                        </div>
                      </td>
                      <td data-l={w('col.status')}>
                        <div className="a2-cell">
                          <span>
                            <span className={`a2-pill ${WA_TONE[state] ?? 'line'}`}>{w(`state.${state}`)}</span>
                          </span>
                          {tp.providerReason ? <span className="a2-xs a2-mute">{tp.providerReason}</span> : null}
                          {tp.problems.map((p) => (
                            <span key={p} className="a2-xs" style={{ color: 'var(--bad)' }} data-testid="wa-problem">
                              {w(`problem.${p}`)}
                            </span>
                          ))}
                          {canSubmit ? <MsgAct dict={md} url={`/api/admin/messages/whatsapp/templates/${tp.id}/submit`} label={w('submit')} busyLabel={w('submitting')} ask={w('submitAsk')} done={{ ok: w('submitted') }} testId="wa-submit" /> : null}
                        </div>
                      </td>
                      <td data-l={w('col.checked')}>
                        <span className="a2-xs">{tp.providerCheckedAt ? when.format(new Date(tp.providerCheckedAt)) : t(d, 'msg.none')}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-xs a2-mute a2-mt12" data-testid="wa-empty">
            {w('none')}
          </p>
        )}
      </section>
      <ChannelsForm dict={md} config={screen.config} version={screen.version} canEdit={screen.perms.write} />
    </div>
  );
}
