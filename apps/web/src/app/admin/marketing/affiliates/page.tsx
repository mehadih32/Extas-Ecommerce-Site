// S28 · PR 695 (CN-048; prototype v5 Marketing › Tools › Influencers & affiliates; gap M11, N4) — at
// /admin/marketing/affiliates. Each partner has a personal code (the code of a coupon the owner made). Commission counts
// only on DELIVERED orders that used the code, after the hold days; a returned parcel earns nothing. The page shows what
// each partner earned, what is on hold, what is paid (an append-only ledger) and what is due. The Pay action is off as
// shipped (owner decision 13 Nov, item 7: not built until the owner says so); when on it needs the money key and writes
// one cost line. Off as shipped: "More options" holds the switches and the numbers (`rules.approve`, the owner).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as rl from '@extas/rules';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AddPartner, PartnerActions, ReversePayout } from '@/components/admin/v5/AffiliateParts';
import { V5Number, V5Switch } from '@/components/admin/v5/Parts';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withW5a } from '@/lib/admin-v5-w5a';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { rulesDeps } from '@/lib/rules-api';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'marketingAffiliates';
const HERE = '/admin/marketing/affiliates';
const API = '/api/admin/marketing/affiliates';

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.aff.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AffiliatesPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('rules.read', deps, MOTHER_STORE_ID)]);
  const view = withW5a(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="affiliates" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="rules.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `w5a.aff.${k}`, v);
  const who: rl.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const board = await rl.affiliateBoard(rulesDeps(access.deps), who);
  const perms = access.guard.permissions;
  const can = { write: perms?.has('rules.write') ?? false, pay: perms?.has('payments.record') ?? false, owner: perms?.has('rules.approve') ?? false };
  const sw = await access.deps.resolver.value('marketing.affiliates', { storeId: MOTHER_STORE_ID });
  const digits = new Intl.NumberFormat(view.locale, { style: 'currency', currency: board.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const money = (minor: number) => new Intl.NumberFormat(view.locale, { style: 'currency', currency: board.currency, numberingSystem: 'latn' }).format(minor / 10 ** digits);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', numberingSystem: 'latn' });
  const nameOf = new Map(board.list.map((x) => [x.id, x.name]));
  const coupons = board.enabled && can.write ? (await access.deps.db.coupon.findMany({ where: { storeId: MOTHER_STORE_ID, archivedAt: null }, orderBy: { code: 'asc' }, take: 200, select: { id: true, code: true } })) : [];
  const used = new Set((await access.deps.db.affiliateCode.findMany({ where: { storeId: MOTHER_STORE_ID }, select: { code: true } })).map((x) => x.code));
  const free = coupons.filter((x) => !used.has(x.code.toUpperCase()));

  return (
    <div className="a2-z" data-testid="affiliates" data-lm-ready="" data-on={board.enabled ? 'yes' : 'no'} data-payouts={board.payoutsOn ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} right={<Link className="a2-btn sm" href="/admin/marketing/referrals">{c('back')}</Link>} />
      {!board.enabled ? <div className="a2-note a2-mt12">{c('off')}</div> : null}
      {board.enabled ? (
        <>
          <div className="a2-kpis a2-mt12">
            {(
              [
                ['kEarned', board.totals.earnedMinor],
                ['kDue', board.totals.dueMinor],
                ['kPaid', board.totals.paidMinor],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="a2-card">
                <div className="a2-xs a2-mute">{c(k)}</div>
                <div className="a2-h2">{money(v)}</div>
              </div>
            ))}
          </div>
          <p className="a2-xs a2-mute a2-mt6">{c('holdNote', { days: board.holdDays })}</p>
          {can.write ? (
            <section className="a2-card a2-mt12" aria-label={c('add')}>
              <h2 className="a2-h3" style={{ marginBottom: 10 }}>
                {c('add')}
              </h2>
              <AddPartner dict={d} coupons={free} defaultPct={board.defaultPct} />
            </section>
          ) : null}
          <section className="a2-card a2-mt12" data-testid="aff-list">
            {board.list.length ? (
              <ul className="cr-rows" style={{ marginTop: 0 }}>
                {board.list.map((x) => (
                  <li key={x.id} data-testid="aff-row" data-status={x.status}>
                    <div>
                      <div className="a2-gap8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <b>{x.name}</b>
                        {x.platform ? <span className="a2-xs a2-mute">{x.platform}</span> : null}
                        {x.handle ? <span className="a2-xs a2-mute">{x.handle}</span> : null}
                        <span className={`a2-pill ${x.status === 'ON' ? 'ok' : 'line'}`}>{c(`status${x.status === 'ON' ? 'ON' : 'PAUSED'}`)}</span>
                      </div>
                      <div className="a2-sm a2-mt6">
                        {x.codes.map((k) => (
                          <b key={k.id} className="a2-mono" style={{ marginRight: 10 }}>
                            {k.code}
                          </b>
                        ))}
                        <span className="a2-mute">
                          {c('pct', { p: x.commissionPct })} · {x.own ? c('ownPct') : c('defaultPct')}
                        </span>
                      </div>
                      <div className="a2-xs a2-mute a2-mt6">
                        {c('delivered', { n: x.deliveredOrders })} · {c('kEarned')} {money(x.earnedMinor)} · {c('kHold')} {money(x.onHoldMinor)} · {c('kPaid')} {money(x.paidMinor)}
                      </div>
                      <div className="a2-h4 a2-mt6">
                        {c('kDue')}: {money(x.dueMinor)}
                      </div>
                    </div>
                    {can.write || can.pay ? <PartnerActions dict={d} id={x.id} name={x.name} status={x.status} dueMinor={x.dueMinor} dueText={money(x.dueMinor)} payoutsOn={board.payoutsOn} canPay={can.pay} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{c('none')}</p>
            )}
            {!board.payoutsOn ? <p className="a2-xs a2-mute a2-mt6">{c('payOff')}</p> : null}
          </section>
          <section className="a2-card a2-mt12" data-testid="aff-ledger">
            <h2 className="a2-h3" style={{ marginBottom: 10 }}>
              {c('ledger')}
            </h2>
            {board.payouts.length ? (
              <ul className="cr-rows" style={{ marginTop: 0 }}>
                {board.payouts.map((p) => (
                  <li key={p.id}>
                    <div className="a2-sm">
                      <span className="a2-mute">{when.format(p.createdAt)}</span> · <b>{nameOf.get(p.affiliateId) ?? '—'}</b> · {money(p.amountMinor)} · {p.method}
                      {p.reversesId ? ` · ${c('reversed')}` : ''}
                    </div>
                    {can.pay && board.payoutsOn && p.amountMinor > 0 && !board.payouts.some((q) => q.reversesId === p.id) ? <ReversePayout dict={d} id={p.id} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{c('ledgerNone')}</p>
            )}
          </section>
          <p className="a2-xs a2-mute a2-mt6">{c('note')}</p>
        </>
      ) : null}
      {can.owner ? (
        <details className="a2-card a2-mt12" data-testid="aff-more">
          <summary className="a2-h4">{t(d, 'w5a.more')}</summary>
          <div className="a2-stack a2-mt12" style={{ gap: 12 }}>
            <V5Switch dict={d} url={`${API}/settings`} before={sw} label={sw.enabled ? c('switchOff') : c('switchOn')} tone={sw.enabled ? '' : 'pri'} testId="aff-switch" />
            <V5Number dict={d} url={`${API}/settings`} before={sw} field="commissionPct" label={c('maxPct')} min={0} max={100} save={t(d, 'w5a.replies.save')} testId="aff-pct" />
            <V5Number dict={d} url={`${API}/settings`} before={sw} field="holdDays" label={c('holdDays')} min={0} max={90} save={t(d, 'w5a.replies.save')} testId="aff-hold" />
            <V5Switch dict={d} url={`${API}/settings`} before={sw} field="payoutsOn" label={sw.payoutsOn ? c('payoutsOffBtn') : c('payoutsOn')} tone="" testId="aff-payouts" />
          </div>
        </details>
      ) : null}
    </div>
  );
}
