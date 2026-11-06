// S13 · PR 259 (Blueprint C6.2, demo 93-admin-ads.js) — Marketing › Ad platforms at /admin/marketing/ad-platforms: each
// platform's connection (a practice copy until its key is in), "Read now", and the ad account's campaigns as the
// platform lists them (status, goal, budget, ad sets), each tied or not to one of the shop's own campaigns. Read only:
// nothing is paused and no budget changes here. Seeing needs `marketing.campaigns.read`; reading and tying need
// `marketing.campaigns.write`. Guide: docs/admin-guide/pages/marketing/ad-platforms.md.
// PR 269: a link to the growth agent's page (ad-platforms/growth: delivered ROAS and proposals that wait for the owner).
// PR 270: a link to the creative briefs (ad-platforms/briefs: briefs for the studio from a product and a campaign).
// PR 268: with the owner's switch on, each campaign's "Change" fold (pause, start again, a new daily budget — always after a
// confirm; more spend waits for the owner's approval), the requests waiting for him and the latest changes, and the
// switch's card (lib/marketing/campaign-control.ts). Practice writers only: no real budget or campaign changes.
// PR 267: cost per order and per delivered order (campaign, platform, shop) and the owner's alert rules, with the card
// that sends the crossed ones to his Telegram after the daily import (lib/marketing/ad-alerts.ts).
// PR 265: "Import spend now" per platform, each campaign's spend over the owner's last days, and the daily import card
// (`ads.spendImport`, off as it ships). PR 266: an account in another currency (dollars) shows the owner's rate (or that
// none is typed yet) with a link to Money › Costs & fees, and each campaign's spend in the store's currency.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { CONTROL_APPROVAL_HOURS_MAX, COST_ALERT_DAYS_MAX, SPEND_DAYS_MAX, SPEND_HOUR_MAX } from '@extas/settings';
import { AD_ALERT_METRICS, type AdCostRow } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AdCampaignLink, AdPlatformRead, AdSpendImport } from '@/components/admin/marketing/AdPlatformControls';
import { AlertRuleAdd, AlertRuleControls, type AlertTexts } from '@/components/admin/marketing/AdAlertControls';
import { AdCampaignControl, AdControlDecide, type ControlTexts } from '@/components/admin/marketing/AdControlControls';
import { CampaignExtra, type CampaignExtraTexts } from '@/components/admin/marketing/AdCampaignBuilder';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { adPlatformsOverview } from '@/lib/marketing/ad-platforms';
import { campaignSpend, spendCard, spendRange } from '@/lib/marketing/ad-spend';
import { currentRate } from '@/lib/exchange-rate';
import { ALERT_PLATFORMS, alertsOverview } from '@/lib/marketing/ad-alerts';
import { controlOverview, isPaused, type ControlRow } from '@/lib/marketing/campaign-control';
import bn from '../../../../../messages/admin-ad-platforms.bn.json';
import en from '../../../../../messages/admin-ad-platforms.en.json';
import '../../settings-cards.css';
import './ad-platforms.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/ad-platforms';
const API = '/api/admin/marketing/ad-platforms';
const SPEND_API = '/api/admin/marketing/ad-platforms/spend';
const ALERTS_API = '/api/admin/marketing/ad-platforms/alerts';
const CONTROL_API = '/api/admin/marketing/ad-platforms/control';
const KEYS_PAGE = '/admin/integrations';
const FEES_PAGE = '/admin/money/fees';
const GROWTH_PAGE = '/admin/marketing/ad-platforms/growth';
const BRIEFS_PAGE = '/admin/marketing/ad-platforms/briefs';
const BUILDER_PAGE = '/admin/marketing/ad-platforms/campaigns';
const BUILDER_API = '/api/admin/marketing/ad-platforms/campaigns';
const KEY = 'marketingAdPlatforms';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'adp.metaTitle'), robots: { index: false, follow: false } };
}

export default async function AdPlatformsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="adp-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const o = await adPlatformsOverview({ db: access.deps.db, resolver: access.deps.resolver, vault: access.deps.vault });
  const [card, tz, storeCur] = await Promise.all([spendCard(access.deps.resolver), access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID }), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const spend = await campaignSpend(access.deps.db, spendRange(new Date(), tz, card.value.days).from);
  // PR 266: the owner's rate for each other currency an ad account is in
  const foreign = [...new Set(o.platforms.flatMap((p) => p.accounts.map((a) => a.currency)).filter((c) => c && c !== storeCur))];
  const rates = await Promise.all(foreign.map(async (base) => ({ base, rate: await currentRate(access.deps.db, MOTHER_STORE_ID, base, storeCur) })));
  const al = await alertsOverview({ db: access.deps.db, resolver: access.deps.resolver });
  const ctl = await controlOverview({ db: access.deps.db, resolver: access.deps.resolver });
  // PR 531: schedule and duplicate in each campaign's fold while the campaign builder is on
  const builderOn = (await access.deps.resolver.value('ads.campaignBuilder', { storeId: MOTHER_STORE_ID })).enabled;
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const canControl = access.guard.permissions?.has('marketing.ads.control') ?? false;
  const canApprove = access.guard.permissions?.has('marketing.ads.approve') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `adp.${k}`, vars);
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone }).format(new Date(iso));
  const budget = (daily: number | null, total: number | null, cur: string) =>
    daily ? s('budgetDaily', { amount: formatMoney(daily, moneyOf(cur, view.locale)) }) : total ? s('budgetTotal', { amount: formatMoney(total, moneyOf(cur, view.locale)) }) : s('none');
  const errs = Object.fromEntries(['PLATFORM', 'INVALID_INPUT', 'NOT_FOUND', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`)]));
  const sp = (k: string, vars?: Record<string, string | number>) => s(`spend.${k}`, vars);
  const spendTexts = { label: sp('import'), working: sp('importing'), done: sp('importDone'), practice: sp('importPractice'), unknown: sp('importUnknown'), noRate: sp('importNoRate'), err: errs };
  const cardTexts: FieldsCardTexts = {
    h: sp('card.h'),
    d: sp('card.d'),
    save: sp('card.save'),
    saving: sp('card.saving'),
    saved: sp('card.saved'),
    discard: sp('card.discard'),
    unsaved: sp('card.unsaved'),
    readOnly: sp('card.readOnly'),
    pairHelp: '',
    err: { ...errs, STALE: s('err.STALE') },
  };
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: sp('card.on'), help: sp('card.onHelp') },
    { kind: 'number', path: 'days', label: sp('card.days'), help: sp('card.daysHelp'), min: 1, max: SPEND_DAYS_MAX },
    { kind: 'number', path: 'hour', label: sp('card.hour'), help: sp('card.hourHelp'), min: 0, max: SPEND_HOUR_MAX },
  ];

  // PR 267: cost per order and the alert rules
  const ap = (k: string, vars?: Record<string, string | number>) => s(`alerts.${k}`, vars);
  const shopMoney = moneyOf(storeCur, view.locale);
  const scale = 10 ** shopMoney.digits;
  const money = (v: number | null) => (v === null ? ap('unknown') : formatMoney(v, shopMoney));
  const names = new Map(o.platforms.flatMap((p) => p.accounts.flatMap((a) => a.campaigns.map((c) => [c.id, c.name] as const))));
  const platformName = (p: string) => s(`platform.${p.toLowerCase()}`);
  const costRows: { row: AdCostRow; label: string; kind: string }[] = [
    { row: al.cost.total, label: ap('scopeShop'), kind: 'total' },
    ...al.cost.platforms.map((r) => ({ row: r, label: platformName(r.key), kind: 'platform' })),
    ...al.cost.campaigns.map((r) => ({ row: r, label: names.get(r.key) ?? ap('gone'), kind: 'campaign' })),
  ];
  const anyUnknown = costRows.some((r) => r.row.spendMinor === null);
  const noFigures = al.cost.total.spendMinor === 0 && al.cost.total.orders === 0 && al.cost.platforms.length === 0 && al.cost.campaigns.length === 0;
  const where = (sc: (typeof al.rules)[number]['scope'], campaignName: string | null) => (sc && 'platform' in sc ? platformName(sc.platform) : sc ? (campaignName ?? ap('gone')) : ap('scopeShop'));
  const alertTexts: AlertTexts = {
    enabled: ap('enabled'),
    limit: ap('limit', { currency: storeCur }),
    saveLimit: ap('saveLimit'),
    archive: ap('archive'),
    addMetric: ap('addMetric'),
    addWhere: ap('addWhere'),
    addLimit: ap('addLimit', { currency: storeCur }),
    add: ap('add'),
    working: ap('working'),
    done: ap('done'),
    err: errs,
  };
  const places = [
    { value: 'shop', label: ap('scopeShop') },
    ...ALERT_PLATFORMS.map((p) => ({ value: `p:${p}`, label: platformName(p) })),
    ...o.platforms.flatMap((p) => p.accounts.flatMap((a) => a.campaigns.filter((c) => !c.gone).map((c) => ({ value: `c:${c.id}`, label: `${platformName(p.platform)} · ${c.name}` })))),
  ];
  const alertCardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: ap('card.on'), help: ap('card.onHelp') },
    { kind: 'number', path: 'days', label: ap('card.days'), help: ap('card.daysHelp'), min: 1, max: COST_ALERT_DAYS_MAX },
    { kind: 'select', path: 'lang', label: ap('card.lang'), options: [{ value: 'bn', label: ap('card.bn') }, { value: 'en', label: ap('card.en') }] },
  ];
  const alertCardTexts: FieldsCardTexts = { ...cardTexts, h: ap('card.h'), d: ap('card.d'), readOnly: ap('card.readOnly') };
  // PR 268: the campaign controls
  const cp = (k: string, vars?: Record<string, string | number>) => s(`control.${k}`, vars);
  const controlOn = ctl.card.value.on;
  const ctlErr = { ...errs, OFF: cp('err.OFF'), WAITING: cp('err.WAITING'), DECIDED: cp('err.DECIDED'), EXPIRED: cp('err.EXPIRED'), BUILDER_OFF: cp('err.BUILDER_OFF') };
  const ctlSaid = Object.fromEntries(['WAITING', 'PRACTICE', 'APPLIED', 'FAILED', 'REJECTED'].map((k) => [k, cp(`said.${k}`)]));
  const controlTexts: ControlTexts = {
    fold: cp('fold'),
    pause: cp('pause'),
    resume: cp('resume'),
    budget: cp('budget', { currency: storeCur }),
    budgetGo: cp('budgetGo'),
    confirm: { pause: cp('confirm.pause'), resume: cp('confirm.resume'), down: cp('confirm.down'), up: cp('confirm.up') },
    yes: cp('yes'),
    cancel: cp('cancel'),
    said: ctlSaid,
    err: ctlErr,
  };
  const extraTexts: CampaignExtraTexts = {
    schedule: cp('schedule'),
    start: cp('start'),
    end: cp('end'),
    scheduleHelp: cp('scheduleHelp'),
    scheduleGo: cp('scheduleGo'),
    confirmSchedule: cp('confirmSchedule'),
    now: cp('now'),
    noEnd: cp('noEnd'),
    duplicate: cp('duplicate'),
    duplicated: cp('duplicated'),
    openDrafts: cp('openDrafts'),
    waiting: cp('said.WAITING'),
    yes: cp('yes'),
    cancel: cp('cancel'),
    err: { ...ctlErr, ...Object.fromEntries(['CONTROL_OFF', 'LOCKED'].map((k) => [k, s(`build.err.${k}`)])) },
    field: Object.fromEntries(['startAt', 'endAt'].map((k) => [k, s(`build.field.${k}`)])),
  };
  const at = (iso: string | null, none: string) => (iso ? when(iso) : none);
  const whatOf = (r: ControlRow) => {
    const m = moneyOf(r.currency, view.locale);
    const ch = r.change;
    const what =
      ch.kind === 'budget'
        ? cp('what.budget', { from: r.fromDailyMinor === null ? s('none') : formatMoney(r.fromDailyMinor, m), to: formatMoney(ch.dailyBudgetMinor, m) })
        : ch.kind === 'create'
          ? `${cp('what.create', { budget: formatMoney(ch.dailyBudgetMinor, m) })} · ${at(ch.startAt, cp('now'))} → ${at(ch.endAt, cp('noEnd'))}`
          : ch.kind === 'schedule'
            ? cp('what.schedule', { from: at(ch.startAt, cp('now')), to: at(ch.endAt, cp('noEnd')) })
            : cp(`what.${ch.kind}`);
    return `${r.platform ? s(`platform.${r.platform}`) : ''} · ${r.campaignName ?? ap('gone')}: ${what}`;
  };
  const controlCardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: cp('card.on'), help: cp('card.onHelp') },
    { kind: 'number', path: 'approvalHours', label: cp('card.hours'), help: cp('card.hoursHelp'), min: 1, max: CONTROL_APPROVAL_HOURS_MAX },
  ];
  const controlCardTexts: FieldsCardTexts = { ...cardTexts, h: cp('card.h'), d: cp('card.d'), readOnly: cp('card.readOnly') };
  const statusPill = (st: string) => (st === 'APPLIED' ? 'g' : st === 'FAILED' ? 'bad' : st === 'WAITING' || st === 'SENDING' ? 'warn' : st === 'PRACTICE' ? 'info' : 'line');
  const pill = (state: string) => (state === 'over' || state === 'noOrders' ? 'bad' : state === 'unknown' ? 'warn' : 'g');

  return (
    <div className="a2-z" data-testid="adp-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note" role="note">
        <span>{s('readOnlyNote')}</span>
      </div>
      <p className="adp-read">
        <Link className="a2-sm adp-keys" href={GROWTH_PAGE} data-testid="adp-growth-link">
          {s('growth.link')}
        </Link>
        <Link className="a2-sm adp-keys" href={BRIEFS_PAGE} data-testid="adp-briefs-link">
          {s('brief.link')}
        </Link>
        <Link className="a2-sm adp-keys" href={BUILDER_PAGE} data-testid="adp-builder-link">
          {s('build.link')}
        </Link>
      </p>
      <p className="a2-sm a2-mute a2-mt12">{sp('spendNote')}</p>
      {rates.map((r) => (
        <div key={r.base} className={`a2-note adp-rate a2-mt12${r.rate ? '' : ' warn'}`} role="note" data-testid={`adp-rate-${r.base}`}>
          <span>{r.rate ? sp('rateLine', { base: r.base, rate: formatMoney(Math.round(Number(r.rate.rate) * 100), moneyOf(storeCur, view.locale)), when: when(r.rate.from), store: storeCur }) : sp('rateNone', { base: r.base })}</span>
          <Link className="a2-sm adp-keys" href={FEES_PAGE}>
            {sp('rateLink')}
          </Link>
        </div>
      ))}

      {o.platforms.map((p) => (
        <section key={p.platform} className="a2-sc a2-mt12" aria-labelledby={`adp-${p.platform}-h`} data-testid={`adp-${p.platform}`} data-mode={p.mode}>
          <div className="adp-head">
            <h2 className="a2-h3" id={`adp-${p.platform}-h`}>
              {s(`platform.${p.platform}`)}
            </h2>
            <span className={`a2-pill ${p.mode === 'MOCK' ? 'warn' : 'g'}`}>{s(`mode.${p.mode}`)}</span>
          </div>
          <p className="a2-sm a2-mute">{p.lastTest ? s('lastTest', { when: when(p.lastTest.at), result: s(p.lastTest.ok ? 'testOk' : 'testBad') }) : s('noTest')}</p>
          <Link className="a2-sm adp-keys" href={KEYS_PAGE}>
            {s('keysLink')}
          </Link>
          {canWrite ? (
            <>
              <AdPlatformRead url={API} platform={p.platform} texts={{ label: s('read'), working: s('reading'), done: s('readDone'), practice: s('readPractice'), err: errs }} />
              <AdSpendImport url={SPEND_API} platform={p.platform} texts={spendTexts} />
            </>
          ) : (
            <p className="a2-sm a2-mute">{s('noManage')}</p>
          )}

          {p.practice ? (
            <div className="a2-mt12" data-testid={`adp-${p.platform}-practice`}>
              <h3 className="a2-sm adp-sub">
                {s('practiceH')} <span className="a2-pill info">{s('practiceBadge')}</span>
              </h3>
              <p className="a2-sm a2-mute">{s('accountLine', { name: p.practice.account.name, id: p.practice.account.externalId, currency: p.practice.account.currency })}</p>
              <div className="a2-tblw a2-mt12">
                <table className="a2-tbl">
                  <thead>
                    <tr>
                      <th>{s('col.name')}</th>
                      <th>{s('col.status')}</th>
                      <th>{s('col.budget')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.practice.campaigns.map((c) => (
                      <tr key={c.externalId}>
                        <td>{c.name}</td>
                        <td className="a2-sm">{c.status}</td>
                        <td className="a2-sm adp-nowrap">{budget(c.dailyBudgetMinor, c.lifetimeBudgetMinor, p.practice!.account.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {!p.accounts.length && !p.practice ? <p className="a2-sm a2-mute a2-mt12">{s('noAccount')}</p> : null}
          {p.accounts.map((a) => (
            <div key={a.id} className="a2-mt12" data-testid="adp-account">
              <p className="a2-sm adp-sub">{s('accountLine', { name: a.name, id: a.externalId, currency: a.currency })}</p>
              {a.campaigns.length ? (
                <div className="a2-tblw a2-mt12">
                  <table className="a2-tbl" data-testid="adp-campaigns">
                    <thead>
                      <tr>
                        <th>{s('col.name')}</th>
                        <th>{s('col.status')}</th>
                        <th>{s('col.objective')}</th>
                        <th>{s('col.budget')}</th>
                        <th>{s('col.adSets')}</th>
                        <th>{sp('spendCol', { days: card.value.days })}</th>
                        <th>{s('col.ours')}</th>
                        {controlOn ? <th>{cp('fold')}</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {a.campaigns.map((c) => (
                        <tr key={c.id} data-gone={c.gone ? 'yes' : 'no'}>
                          <td>
                            {c.name}
                            {c.gone ? <span className="a2-pill line adp-gone">{s('gone')}</span> : null}
                          </td>
                          <td className="a2-sm">{c.status}</td>
                          <td className="a2-sm">{c.objective ?? s('none')}</td>
                          <td className="a2-sm adp-nowrap">{budget(c.dailyBudgetMinor, c.lifetimeBudgetMinor, c.currency)}</td>
                          <td className="a2-sm">{c.adSets}</td>
                          <td className="a2-sm" data-testid="adp-spend-cell">
                            {spend.get(c.id) ? (
                              <>
                                <b className="adp-nowrap">{formatMoney(spend.get(c.id)!.minor, moneyOf(c.currency, view.locale))}</b>
                                {c.currency !== storeCur ? (
                                  <span className="adp-nowrap" data-testid="adp-spend-store">
                                    {' '}
                                    {spend.get(c.id)!.storeMinor === null ? sp('noRate') : sp('inStore', { amount: formatMoney(spend.get(c.id)!.storeMinor!, moneyOf(storeCur, view.locale)) })}
                                  </span>
                                ) : null}
                                <br />
                                <span className="a2-mute">{sp('spendLine', { purchases: formatNumber(spend.get(c.id)!.purchases, view.locale) })}</span>
                              </>
                            ) : (
                              <span className="a2-mute">{sp('spendNone')}</span>
                            )}
                          </td>
                          <td>
                            <AdCampaignLink url={API} adCampaignId={c.id} value={c.campaign?.id ?? null} ours={o.ours} label={s('linkLabel', { name: c.name })} none={s('linkNone')} disabled={!canWrite} err={s('linkErr')} />
                          </td>
                          {controlOn ? (
                            <td data-l={cp('fold')}>
                              {canControl && !c.gone ? (
                                <AdCampaignControl url={CONTROL_API} adCampaignId={c.id} name={c.name} paused={isPaused(c.status)} dailyBudgetMinor={c.dailyBudgetMinor} scale={10 ** moneyOf(c.currency, view.locale).digits} none={s('none')} currency={c.currency} locale={view.locale} texts={controlTexts}>
                                  {builderOn ? <CampaignExtra controlUrl={CONTROL_API} builderUrl={BUILDER_API} draftsHref={BUILDER_PAGE} adCampaignId={c.id} name={c.name} texts={extraTexts} /> : null}
                                </AdCampaignControl>
                              ) : (
                                <span className="a2-sm a2-mute">{canControl ? s('gone') : cp('noControl')}</span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="a2-sm a2-mute">{s('noCampaigns')}</p>
              )}
            </div>
          ))}
        </section>
      ))}
      {controlOn ? (
        <section className="a2-sc a2-mt12" aria-labelledby="adp-control-h" data-testid="adp-control">
          <h2 className="a2-h3" id="adp-control-h">
            {cp('h')}
          </h2>
          <p className="a2-sm a2-mute">{cp('d')}</p>
          <h3 className="a2-sm adp-sub a2-mt12">{cp('waitingH')}</h3>
          {ctl.waiting.length ? (
            <ul className="adp-rules" data-testid="adp-waiting">
              {ctl.waiting.map((r) => (
                <li key={r.id} className="adp-rule" data-testid="adp-waiting-row">
                  <p className="a2-sm adp-sub">{whatOf(r)}</p>
                  {r.expiresAt ? <p className="a2-sm a2-mute">{cp('expires', { when: when(r.expiresAt) })}</p> : null}
                  {canApprove ? (
                    <AdControlDecide url={CONTROL_API} id={r.id} what={whatOf(r)} texts={{ approve: cp('approve'), reject: cp('reject'), confirmApprove: cp('confirmApprove'), confirmReject: cp('confirmReject'), yes: cp('yes'), cancel: cp('cancel'), said: ctlSaid, err: ctlErr }} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-sm a2-mute">{cp('waitingNone')}</p>
          )}
          <h3 className="a2-sm adp-sub a2-mt12">{cp('recentH')}</h3>
          {ctl.recent.length ? (
            <ul className="adp-log" data-testid="adp-recent">
              {ctl.recent.map((r) => (
                <li key={r.id} className="a2-sm" data-status={r.status}>
                  <span className={`a2-pill ${statusPill(r.status)}`}>{cp(`status.${r.status}`)}</span> {whatOf(r)} <span className="a2-mute">· {when(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-sm a2-mute">{cp('recentNone')}</p>
          )}
        </section>
      ) : null}
      <section className="a2-sc a2-mt12" aria-labelledby="adp-alerts-h" data-testid="adp-alerts">
        <h2 className="a2-h3" id="adp-alerts-h">
          {ap('h')}
        </h2>
        <p className="a2-sm a2-mute">{ap('d', { days: al.card.value.days, from: al.cost.from, to: al.cost.to })}</p>
        {noFigures ? (
          <p className="a2-sm a2-mute a2-mt12" data-testid="adp-cost-none">
            {ap('noFigures')}
          </p>
        ) : (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="adp-cost">
              <thead>
                <tr>
                  <th>{ap('col.where')}</th>
                  <th>{ap('col.spend')}</th>
                  <th>{ap('col.purchases')}</th>
                  <th>{ap('col.orders')}</th>
                  <th>{ap('col.delivered')}</th>
                  <th>{ap('col.returned')}</th>
                  <th>{ap('col.perOrder')}</th>
                  <th>{ap('col.perDelivered')}</th>
                </tr>
              </thead>
              <tbody>
                {costRows.map(({ row, label, kind }) => (
                  <tr key={`${kind}-${row.key}`} data-kind={kind}>
                    <td className={kind === 'campaign' ? 'adp-camp' : 'adp-sub'}>{label}</td>
                    <td className="a2-sm adp-nowrap" data-l={ap('col.spend')}>
                      {money(row.spendMinor)}
                    </td>
                    <td className="a2-sm" data-l={ap('col.purchases')}>
                      {formatNumber(row.platformPurchases, view.locale)}
                    </td>
                    <td className="a2-sm" data-l={ap('col.orders')}>
                      {formatNumber(row.orders, view.locale)}
                    </td>
                    <td className="a2-sm" data-l={ap('col.delivered')}>
                      {formatNumber(row.delivered, view.locale)}
                    </td>
                    <td className="a2-sm" data-l={ap('col.returned')}>
                      {formatNumber(row.returned, view.locale)}
                    </td>
                    <td className="a2-sm adp-nowrap" data-l={ap('col.perOrder')}>
                      {row.perOrderMinor === null ? '—' : formatMoney(row.perOrderMinor, shopMoney)}
                    </td>
                    <td className="a2-sm adp-nowrap" data-l={ap('col.perDelivered')} data-testid="adp-cost-per-delivered">
                      {row.perDeliveredMinor === null ? '—' : formatMoney(row.perDeliveredMinor, shopMoney)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {anyUnknown ? (
          <div className="a2-note warn a2-mt12" role="note">
            <span>{ap('unknownNote')}</span>
          </div>
        ) : null}

        <h3 className="a2-sm adp-sub a2-mt12">{ap('rulesH')}</h3>
        <p className="a2-sm a2-mute">{ap('rulesD')}</p>
        {al.rules.length ? (
          <ul className="adp-rules" data-testid="adp-rules">
            {al.rules.map((r) => {
              const line = ap('ruleLine', { metric: ap(`metric.${r.metric}`), where: where(r.scope, r.campaignName), limit: formatMoney(r.thresholdMinor, shopMoney) });
              return (
                <li key={r.id} className="adp-rule" data-testid="adp-rule" data-state={r.hit.state} data-on={r.enabled ? 'yes' : 'no'}>
                  <p className="a2-sm adp-sub">{line}</p>
                  <span className={`a2-pill ${pill(r.hit.state)}`}>{ap(`state.${r.hit.state}`, { value: money(r.hit.valueMinor), spend: money(r.hit.spendMinor) })}</span>
                  <AlertRuleControls url={ALERTS_API} id={r.id} enabled={r.enabled} thresholdMinor={r.thresholdMinor} scale={scale} label={line} canEdit={canWrite} texts={alertTexts} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{ap('noRules')}</p>
        )}
        {canWrite ? (
          <>
            <h3 className="a2-sm adp-sub a2-mt12">{ap('addH')}</h3>
            <AlertRuleAdd url={ALERTS_API} scale={scale} metrics={AD_ALERT_METRICS.map((m) => ({ value: m, label: ap(`metric.${m}`) }))} places={places} texts={alertTexts} />
          </>
        ) : null}
      </section>
      <div id="adp-alerts-card" className="a2-mt12">
        <FieldsCard url={ALERTS_API} screen={{ key: al.card.key, value: al.card.value, version: al.card.version }} fields={alertCardFields} texts={alertCardTexts} canEdit={canWrite} testId="adp-alerts-card" />
      </div>
      <div id="adp-control-card" className="a2-mt12">
        <FieldsCard url={CONTROL_API} screen={{ key: ctl.card.key, value: ctl.card.value, version: ctl.card.version }} fields={controlCardFields} texts={controlCardTexts} canEdit={canApprove} testId="adp-control-card" />
      </div>
      <div id="adp-spend-card" className="a2-mt12">
        <FieldsCard url={SPEND_API} screen={{ key: card.key, value: card.value, version: card.version }} fields={cardFields} texts={cardTexts} canEdit={canWrite} testId="adp-spend-card" />
      </div>
    </div>
  );
}
