// S13 · PR 269 (register "AI growth agent — reads performance, proposes changes, waits for approval"; Blueprint C3.1 row
// 8; demo 93-admin-ads.js Tirondaj's suggestions) — Marketing › Ad platforms › Growth agent at
// /admin/marketing/ad-platforms/growth: the proposals waiting for the owner (Approve / Reject after a confirm), "Run now",
// the campaigns spending with no delivered order, delivered ROAS by campaign, product and district over his last days,
// the decided proposals, and the agent's limits (off as shipped, every kind off at 0). Seeing needs
// `marketing.campaigns.read`; running `marketing.ads.control`; deciding and the limits `marketing.ads.approve`.
// lib/marketing/growth-agent.ts. Guide: docs/admin-guide/pages/marketing/ad-growth.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { GROWTH_APPROVAL_HOURS_MAX, GROWTH_DAYS_MAX, GROWTH_PROPOSALS_MAX, GROWTH_ROAS_MAX, GROWTH_SPEND_MAX } from '@extas/settings';
import type { AdReturnRow } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AdControlDecide } from '@/components/admin/marketing/AdControlControls';
import { GrowthRun } from '@/components/admin/marketing/GrowthControls';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { approvalExplainOption } from '@/lib/admin-ai/approval-explain-dispatch';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { growthOverview, TOP, type ProposalView } from '@/lib/marketing/growth-agent';
import bn from '../../../../../../messages/admin-ad-platforms.bn.json';
import en from '../../../../../../messages/admin-ad-platforms.en.json';
import '../../../settings-cards.css';
import '../ad-platforms.css';
import './growth.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/ad-platforms/growth';
const BACK = '/admin/marketing/ad-platforms';
/** PR 270: an approved creative refresh is written up as a brief there. */
const BRIEFS = '/admin/marketing/ad-platforms/briefs';
const API = '/api/admin/marketing/ad-platforms/growth';
const KEY = 'marketingAdGrowth';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'adp.growth.metaTitle'), robots: { index: false, follow: false } };
}

export default async function GrowthAgentPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="adg-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const o = await growthOverview({ db: access.deps.db, resolver: access.deps.resolver }, view.lang === 'bn' ? 'bn' : 'en');
  const canControl = access.guard.permissions?.has('marketing.ads.control') ?? false;
  const canApprove = access.guard.permissions?.has('marketing.ads.approve') ?? false;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `adp.growth.${k}`, vars);
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone }).format(new Date(iso));
  const shop = moneyOf(o.currency, view.locale);
  const money = (v: number | null) => (v === null ? g('unknown') : formatMoney(v, shop));
  const pct = (v: number | null) => (v === null ? g('unknown') : `${formatNumber(v, view.locale)}%`);
  const nameOf = (id: string) => (id ? (o.names[id] ?? g('gone')) : g('noDistrict'));
  const what = (p: ProposalView) => {
    const m = moneyOf(o.campaignCurrency[p.refId] ?? p.currency, view.locale);
    return g(`type.${p.type}`, { name: p.name ?? g('gone'), from: p.fromDailyMinor === null ? '' : formatMoney(p.fromDailyMinor, m), to: p.toDailyMinor === null ? '' : formatMoney(p.toDailyMinor, m) });
  };
  const limitOf = (p: ProposalView) => pct(p.type === 'lowerBudget' ? o.card.value.poorRoasPercent : o.card.value.goodRoasPercent);
  const why = (p: ProposalView) => g(`why.${p.type}`, { spend: money(p.spendMinor), from: p.from, to: p.to, roas: pct(p.roasPercent), before: pct(p.beforeRoasPercent), limit: limitOf(p), delivered: formatNumber(p.delivered, view.locale), sales: money(p.deliveredSalesMinor) });
  // PR 330: a plain AI paragraph on why each waiting proposal is asking, grounded only in this page's own `what`/
  // `why` sentences (already localized, already decided — PR 269's own growth model); `null` (AI off, no ready
  // connection, capped, or the model answered nothing) leaves the proposal card exactly as PR 269 already built it.
  const aiNotes = new Map(
    await Promise.all(o.waiting.map(async (p) => [p.id, await approvalExplainOption(access.deps, MOTHER_STORE_ID, p.id, view.lang === 'bn' ? 'bn' : 'en')({ title: what(p), why: [why(p)] })] as const)),
  );
  const errs = Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, t(d, `adp.err.${k}`)]));
  const decideErr = { ...errs, ...Object.fromEntries(['CONTROL_OFF', 'CHANGED', 'WAITING', 'DECIDED', 'EXPIRED'].map((k) => [k, g(`err.${k}`)])) };
  const said = Object.fromEntries(['APPROVED', 'REJECTED', 'PRACTICE', 'APPLIED', 'FAILED'].map((k) => [k, g(`said.${k}`)]));
  const pill = (st: string) => (st === 'APPLIED' || st === 'APPROVED' ? 'g' : st === 'FAILED' ? 'bad' : st === 'PRACTICE' ? 'info' : st === 'EXPIRED' ? 'warn' : 'line');
  const c = (k: string, vars?: Record<string, string | number>) => g(`card.${k}`, vars);
  const cardTexts: FieldsCardTexts = { h: c('h'), d: c('d'), save: t(d, 'adp.spend.card.save'), saving: t(d, 'adp.spend.card.saving'), saved: t(d, 'adp.spend.card.saved'), discard: t(d, 'adp.spend.card.discard'), unsaved: t(d, 'adp.spend.card.unsaved'), readOnly: c('readOnly'), pairHelp: '', err: { ...errs, STALE: t(d, 'adp.err.STALE') } };
  const num = (path: string, min: number, max: number, vars?: Record<string, string | number>): FieldsCardField => ({ kind: 'number', path, label: c(path), help: c(`${path}Help`, vars), min, max });
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: c('on'), help: c('onHelp') },
    num('days', 1, GROWTH_DAYS_MAX),
    num('minDelivered', 1, 1000), // hardcode-ok: the setting's own bound
    num('goodRoasPercent', 0, GROWTH_ROAS_MAX),
    num('poorRoasPercent', 0, GROWTH_ROAS_MAX),
    num('stepPercent', 1, 90), // hardcode-ok: the setting's own bound
    num('noDeliveredSpend', 0, GROWTH_SPEND_MAX, { currency: o.currency }),
    num('fatiguePercent', 0, 100), // hardcode-ok: a percentage
    num('approvalHours', 1, GROWTH_APPROVAL_HOURS_MAX),
    num('maxProposals', 1, GROWTH_PROPOSALS_MAX),
  ];
  const noFigures = o.now.campaigns.length === 0;
  const table = (id: string, rows: AdReturnRow[]) => (
    <>
      <h3 className="a2-sm adp-sub a2-mt12">{g(`tab.${id}`)}</h3>
      <div className="a2-tblw adg-mt8">
      <table className="a2-tbl" data-testid={`adg-${id}`}>
        <thead>
          <tr>
            <th>{g('col.name')}</th>
            <th>{g('col.spend')}</th>
            <th>{g('col.delivered')}</th>
            <th>{g('col.sales')}</th>
            <th>{g('col.roas')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key || 'none'}>
              <td className="adp-sub">{nameOf(r.key)}</td>
              <td className="a2-sm adp-nowrap" data-l={g('col.spend')}>
                {money(r.spendMinor)}
              </td>
              <td className="a2-sm" data-l={g('col.delivered')}>
                {formatNumber(r.delivered, view.locale)}
              </td>
              <td className="a2-sm adp-nowrap" data-l={g('col.sales')}>
                {money(r.deliveredSalesMinor)}
              </td>
              <td className="a2-sm adp-nowrap" data-l={g('col.roas')}>
                {pct(r.roasPercent)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );

  return (
    <div className="a2-z" data-testid="adg-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="adg-mt8">
        <Link className="a2-sm adp-keys" href={BACK}>
          {g('back')}
        </Link>
      </p>
      <div className="a2-note" role="note">
        <span>{g('note')}</span>
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="adg-wait-h" data-testid="adg-waiting">
        <h2 className="a2-h3" id="adg-wait-h">
          {g('waitingH')}
        </h2>
        {canControl ? <GrowthRun url={API} texts={{ run: g('run'), running: g('running'), ran: g('ran'), err: errs }} /> : <p className="a2-sm a2-mute">{g('noRun')}</p>}
        {o.waiting.length ? (
          <ul className="adp-rules" data-testid="adg-waiting-list">
            {o.waiting.map((p) => (
              <li key={p.id} className="adp-rule" data-testid="adg-proposal" data-type={p.type}>
                <p className="a2-sm adp-sub">{what(p)}</p>
                <p className="a2-sm">{why(p)}</p>
                {aiNotes.get(p.id) ? (
                  <div className="a2-note a2-mt12" role="note" data-testid="adg-ai-note">
                    <ShellIcon name="spark" size={15} />
                    <span>
                      <b className="a2-blk">{g('aiNote.label')}</b>
                      <span className="a2-blk">{aiNotes.get(p.id)}</span>
                    </span>
                  </div>
                ) : null}
                {p.expiresAt ? <p className="a2-sm a2-mute">{g('expires', { when: when(p.expiresAt) })}</p> : null}
                {canApprove ? <AdControlDecide url={API} id={p.id} what={what(p)} texts={{ approve: g('approve'), reject: g('reject'), confirmApprove: g('confirmApprove'), confirmReject: g('confirmReject'), yes: g('yes'), cancel: g('cancel'), said, err: decideErr }} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute adg-mt8">{g('waitingNone')}</p>
        )}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="adg-flag-h" data-testid="adg-flagged">
        <h2 className="a2-h3" id="adg-flag-h">
          {g('flagH')}
        </h2>
        <p className="a2-sm a2-mute">{g('flagD', { from: o.now.from, to: o.now.to })}</p>
        {o.flagged.length ? (
          <ul className="adp-log">
            {o.flagged.map((r) => (
              <li key={r.key} className="a2-sm">
                <span className="a2-pill bad">{money(r.spendMinor)}</span> {nameOf(r.key)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{g('flagNone')}</p>
        )}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="adg-roas-h" data-testid="adg-roas">
        <h2 className="a2-h3" id="adg-roas-h">
          {g('roasH')}
        </h2>
        <p className="a2-sm a2-mute">{g('roasD', { from: o.now.from, to: o.now.to, days: o.card.value.days })}</p>
        {noFigures ? (
          <p className="a2-sm a2-mute adg-mt8" data-testid="adg-none">
            {g('noFigures')}
          </p>
        ) : (
          <>
            {table('campaigns', o.now.campaigns)}
            {o.now.products.length ? table('products', o.now.products.slice(0, TOP)) : null}
            {o.now.districts.length ? table('districts', o.now.districts.slice(0, TOP)) : null}
          </>
        )}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="adg-done-h" data-testid="adg-decided">
        <h2 className="a2-h3" id="adg-done-h">
          {g('decidedH')}
        </h2>
        {o.recent.length ? (
          <ul className="adp-log">
            {o.recent.map((p) => {
              const st = p.outcome ?? p.status;
              return (
                <li key={p.id} className="a2-sm" data-status={st}>
                  <span className={`a2-pill ${pill(st)}`}>{g(`status.${st}`)}</span> {what(p)} <span className="a2-mute">· {when(p.createdAt)}</span>
                  {p.type === 'refreshCreative' && p.status === 'APPROVED' ? (
                    <>
                      {' '}
                      <Link className="a2-sm adp-keys adg-brief" href={BRIEFS} data-testid="adg-brief-link">
                        {g('briefLink')}
                      </Link>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{g('decidedNone')}</p>
        )}
      </section>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canApprove} testId="adg-card" />
      </div>
    </div>
  );
}
