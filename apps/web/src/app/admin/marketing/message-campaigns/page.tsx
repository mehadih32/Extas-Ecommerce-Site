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
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
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
  const view = withW5a(plain);
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
  const digits = new Intl.NumberFormat(view.locale, { style: 'currency', currency: o.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const money = (minor: number) => new Intl.NumberFormat(view.locale, { style: 'currency', currency: o.currency, numberingSystem: 'latn' }).format(minor / 10 ** digits);
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const hrefOf = (r: cu.OverviewRow) => (r.kind === 'email' ? `/admin/messages/email/${r.id}` : `/admin/messages/campaigns/${r.id}`);

  return (
    <div className="a2-z" data-testid="message-campaigns" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <section className="a2-card a2-mt12" aria-label={c('new')} data-testid="camp-new">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {c('new')}
        </h2>
        <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
          <Link className="a2-btn pri sm" href="/admin/messages/campaigns/new?kind=blast">
            {c('newGroup')}
          </Link>
          <Link className="a2-btn sm" href="/admin/messages/campaigns/new">
            {c('newWin')}
          </Link>
          <Link className="a2-btn sm" href="/admin/messages/email">
            {c('newEmail')}
          </Link>
          <Link className="a2-btn sm" href="/admin/messages/journey" data-testid="camp-auto">
            {c('auto')}
          </Link>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('messenger')}</p>
      </section>
      <div className="a2-kpis a2-mt12">
        <div className="a2-card">
          <div className="a2-xs a2-mute">{c('kSends')}</div>
          <div className="a2-h2">{n(o.totals.sends)}</div>
        </div>
        <div className="a2-card">
          <div className="a2-xs a2-mute">{c('kSent')}</div>
          <div className="a2-h2">{n(o.totals.sent)}</div>
        </div>
        <div className="a2-card">
          <div className="a2-xs a2-mute">{c('kCost')}</div>
          <div className="a2-h2">{money(o.totals.costMinor)}</div>
        </div>
        <div className="a2-card">
          <div className="a2-xs a2-mute">{c('kRoi', { c: o.currency })}</div>
          <div className="a2-h2" data-testid="camp-roi">
            {o.salesPerCost === null ? c('roiNone') : n(o.salesPerCost)}
          </div>
        </div>
      </div>
      <nav className="a2-views a2-mt12" aria-label={c('title')}>
        {FILTERS.map(([v, k]) => (
          <Link key={k} className={`a2-view${(channel ?? '') === v ? ' on' : ''}`} href={v ? `${HERE}?channel=${v}` : HERE} aria-current={(channel ?? '') === v ? 'page' : undefined}>
            {c(k)}
          </Link>
        ))}
      </nav>
      <section className="a2-card" data-testid="camp-list">
        {o.rows.length ? (
          <ul className="cr-rows" style={{ marginTop: 0 }}>
            {o.rows.map((r) => (
              <li key={r.id} data-testid="camp-row" data-kind={r.kind}>
                <div>
                  <div className="a2-gap8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <b>{r.name}</b>
                    <span className="a2-pill line">{c(`kind_${r.kind}`)}</span>
                    <span className="a2-xs a2-mute">{r.channel}</span>
                    <span className="a2-xs a2-mute">{r.status}</span>
                  </div>
                  <div className="a2-xs a2-mute a2-mt6">
                    {r.segmentName ?? c('everyone')} · {c('colSent')} {n(r.sent)} · {c('colCost')} {money(r.costMinor)} · {c('colOrders')} {n(r.deliveredOrders)} · {c('colSales')} {money(r.deliveredValueMinor)}
                  </div>
                </div>
                <Link className="cr-link" href={hrefOf(r)}>
                  {c('open')}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{c('none')}</p>
        )}
      </section>
      {canTest ? (
        <section className="a2-card a2-mt12" aria-label={c('testTitle')}>
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {c('testTitle')}
          </h2>
          <TestSend dict={d} templates={templates} />
        </section>
      ) : null}
      <p className="a2-xs a2-mute a2-mt6">{c('note')}</p>
    </div>
  );
}
