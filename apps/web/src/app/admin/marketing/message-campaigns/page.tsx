// S28 · PR 697 (CN-048; prototype v5 Marketing › Message campaigns; gap M4, M5, N6) — at /admin/marketing/message-campaigns.
// Every WhatsApp, SMS and e-mail send of the shop in one list (win-back, group campaigns, e-mail sends), with its channel,
// state, group, numbers, cost and what the people who got it ordered (delivered orders and sales), a channel filter, the
// buttons to start each kind in its own builder (the consent, approved template, schedule and speed checks live there),
// "Automatic messages", and a test send of one template to the person's own phone or e-mail. Messenger is practice only
// (Meta's 24-hour rule; no broadcast is built). Read only otherwise. Seeing needs `messages.journey.read`; the test send
// `messages.campaigns.write`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { TestSend } from '@/components/admin/v5/CampaignParts';
import { Chips, GuideNote, Kpi, KpiGrid } from '@/components/admin/lane-f/Parts';
import { withLaneF } from '@/lib/admin-lane-f';
import { moneyOf, numOf, perOf, symbolOf } from '@/lib/lane-f/format';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withW5a } from '@/lib/admin-v5-w5a';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { customersDeps } from '@/lib/customers-api';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'marketingMessageCampaigns';
const HERE = '/admin/marketing/message-campaigns';
/** Days without an order that make a customer "at risk" in the card above the list (the prototype's own 30). */
const RISK_DAYS = 30; // hardcode-ok: the prototype's at-risk rule, shown in the words
const FILTERS = [
  ['', 'filterAll'],
  ['WHATSAPP', 'filterWhatsapp'],
  ['SMS', 'filterSms'],
  ['EMAIL', 'filterEmail'],
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.camp.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MessageCampaignsPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const deps = adminDeps();
  const [plain, access, q] = await Promise.all([adminView(deps), pageAccess('messages.journey.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withLaneF(withW5a(plain));
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="message-campaigns" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="messages.journey.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `w5a.camp.${k}`, v);
  const channel = FILTERS.some(([v]) => v && v === q.channel) ? q.channel : undefined;
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const o = await cu.campaignOverview(customersDeps(access.deps), who, channel);
  const canTest = access.guard.permissions?.has('messages.campaigns.write') ?? false;
  const templates = canTest
    ? (await access.deps.db.notificationTemplate.findMany({ where: { storeId: MOTHER_STORE_ID, archivedAt: null, channel: { in: ['SMS', 'WHATSAPP', 'EMAIL'] } }, orderBy: [{ name: 'asc' }, { channel: 'asc' }], take: 300, select: { id: true, key: true, name: true, channel: true, locale: true } }))
        .filter((x) => cu.isCampaignKey(x.key) && !x.key.startsWith('crmEmail.'))
        .map((x) => ({ id: x.id, label: `${x.name} · ${x.channel} · ${x.locale}` }))
    : [];
  const [journeys, atRisk] = await Promise.all([
    cu.journeysScreen(customersDeps(access.deps), who).catch(() => null),
    access.deps.db.customer.count({ where: { storeId: MOTHER_STORE_ID, deliveredCount: { gte: 1 }, lastOrderAt: { lt: new Date(new Date().getTime() - RISK_DAYS * 86_400_000) } } }), // hardcode-ok: ms in a day
  ]);
  const f = (k: string, v?: Record<string, string | number>) => t(d, `lf.mc.${k}`, v);
  const cur = symbolOf(o.currency);
  const money = (minor: number) => moneyOf(minor, o.currency);
  const n = (x: number) => numOf(x);
  const hrefOf = (r: cu.OverviewRow) => (r.kind === 'email' ? `/admin/messages/email/${r.id}` : `/admin/messages/campaigns/${r.id}`);
  const sentRows = o.rows.filter((r) => r.sent > 0);
  const stateOf = (r: cu.OverviewRow) => (r.sent > 0 ? 'sentState' : r.scheduledAt ? 'schedState' : 'otherState');
  const stateTone = (r: cu.OverviewRow) => (r.sent > 0 ? 'ok' : r.scheduledAt ? 'info' : '');
  const chips = FILTERS.map(([v, k]) => ({ key: v, label: c(k), href: v ? `${HERE}?channel=${v}` : HERE }));
  const autos = (journeys?.journeys ?? []).slice(0, 6); // hardcode-ok: a short list on this page; the rest is on its own page

  return (
    <div className="a2-z" data-testid="message-campaigns" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={f('title')}
        sub={f('sub')}
        right={
          <Link className="a2-btn pri" href="/admin/messages/campaigns/new?kind=blast" data-testid="camp-create">
            {f('new')}
          </Link>
        }
      />
      <SectionTabs view={view} current={KEY} />
      <KpiGrid cols={4}>
        <Kpi testId="camp-k-sent" label={f('kSent')} value={n(o.totals.sent)} sub={f('kSentSub', { n: sentRows.length })} />
        <Kpi testId="camp-k-orders" label={f('kOrders')} value={n(o.totals.deliveredOrders)} />
        <Kpi testId="camp-k-sales" label={f('kSales')} value={money(o.totals.deliveredValueMinor)} />
        <Kpi testId="camp-roi" label={f('kPer', { cur })} value={o.salesPerCost === null ? c('roiNone') : perOf(o.salesPerCost, o.currency)} sub={f('kPerSub', { x: money(o.totals.costMinor) })} />
      </KpiGrid>
      {atRisk > 0 ? (
        <div className="a2-note warn a2-mt12" data-testid="camp-risk">
          <span>{f('risk', { n: n(atRisk), days: RISK_DAYS })}</span>{' '}
          <Link className="a2-lnk" href="/admin/messages/campaigns/new">
            {f('riskGo')} →
          </Link>
        </div>
      ) : null}
      <section className="a2-card a2-mt12" data-testid="camp-list">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {f('campaigns')}
        </h2>
        <Chips items={chips} current={channel ?? ''} testId="camp-chips" label={f('campaigns')} />
        {o.rows.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="camp-table">
              <thead>
                <tr>
                  <th>{f('col.campaign')}</th>
                  <th>{f('col.status')}</th>
                  <th className="r">{f('col.sent')}</th>
                  <th className="r">{f('col.orders')}</th>
                  <th className="r">{f('col.sales')}</th>
                  <th className="r">{f('col.cost')}</th>
                </tr>
              </thead>
              <tbody>
                {o.rows.map((r) => (
                  <tr key={r.id} data-testid="camp-row" data-kind={r.kind}>
                    <td>
                      <Link className="a2-b lf-cn" href={hrefOf(r)}>
                        {r.name}
                      </Link>
                      <span className="a2-xs a2-mute lf-cs">
                        {r.channel} · {r.segmentName ?? c('everyone')} · {c(`kind_${r.kind}`)}
                      </span>
                    </td>
                    <td>
                      <span className={`a2-pill ${stateTone(r)}`}>{f(stateOf(r))}</span>
                    </td>
                    <td className="r a2-num">{n(r.sent)}</td>
                    <td className="r a2-num">{n(r.deliveredOrders)}</td>
                    <td className="r a2-num">{money(r.deliveredValueMinor)}</td>
                    <td className="r a2-num">{money(r.costMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12">{c('none')}</p>
        )}
      </section>
      <section className="a2-card a2-mt12" data-testid="camp-autos">
        <h2 className="a2-h3">{f('autos')}</h2>
        <p className="a2-xs a2-mute" style={{ marginBottom: 10 }}>
          {f('autosSub')}
        </p>
        {autos.length ? (
          <ul className="cr-rows" style={{ marginTop: 0 }}>
            {autos.map((a) => (
              <li key={a.id} data-testid="camp-auto-row">
                <div>
                  <b>{a.name}</b>
                  <div className="a2-xs a2-mute">{f('autosSent', { n: n(a.sent) })}</div>
                </div>
                <span className={`a2-pill ${a.enabled ? 'ok' : ''}`}>{a.enabled ? f('autosOn') : f('autosOff')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{f('autosNone')}</p>
        )}
        <GuideNote>
          {f('autosNote')}{' '}
          <Link className="a2-lnk" href="/admin/messages/templates">
            {f('autosEdit')} →
          </Link>{' '}
          <Link className="a2-lnk" href="/admin/messages/journey" data-testid="camp-auto">
            {f('autosAll')} →
          </Link>
        </GuideNote>
      </section>
      <details className="a2-card a2-mt12" data-testid="camp-more">
        <summary className="a2-h4">{f('more')}</summary>
        <div className="a2-gap8 a2-mt12" style={{ flexWrap: 'wrap' }} data-testid="camp-new">
          <Link className="a2-btn sm" href="/admin/messages/campaigns/new">
            {c('newWin')}
          </Link>
          <Link className="a2-btn sm" href="/admin/messages/email">
            {c('newEmail')}
          </Link>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('messenger')}</p>
        {canTest ? (
          <div className="a2-mt12">
            <h3 className="a2-h4" style={{ marginBottom: 8 }}>
              {c('testTitle')}
            </h3>
            <TestSend dict={d} templates={templates} />
          </div>
        ) : null}
      </details>
      <p className="a2-xs a2-mute a2-mt6">{c('note')}</p>
    </div>
  );
}
