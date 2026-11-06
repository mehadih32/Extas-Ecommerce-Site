// S13 · PR 531 (register "Full campaign control from the dashboard — create, run, duplicate, schedule and re-budget a
// campaign, not only pause it"; demo 93-admin-ads.js) — Marketing › Ad platforms › New campaigns at
// /admin/marketing/ad-platforms/campaigns: a new campaign as a draft (account, shop campaign, name, what it is for, daily
// budget, start and end on the shop's clock), the drafts with Change / Duplicate / Launch… / Set aside, a waiting launch
// with the owner's Approve / Reject, the set-aside drafts, and the switch (off as shipped). A launch always waits for the
// owner. Seeing needs `marketing.campaigns.read`; writing `marketing.ads.control`; deciding and the switch
// `marketing.ads.approve`. lib/marketing/campaign-builder.ts. Guide: docs/admin-guide/pages/marketing/ad-campaigns.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CAMPAIGN_OBJECTIVES } from '@extas/adapters';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { DraftForm, DraftStep, type DraftFormTexts, type DraftStepTexts, type DraftValues } from '@/components/admin/marketing/AdCampaignBuilder';
import { AdControlDecide } from '@/components/admin/marketing/AdControlControls';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { builderOverview, DRAFT_NAME_MAX, type DraftRow } from '@/lib/marketing/campaign-builder';
import bn from '../../../../../../messages/admin-ad-platforms.bn.json';
import en from '../../../../../../messages/admin-ad-platforms.en.json';
import '../../../settings-cards.css';
import '../ad-platforms.css';
import '../briefs/briefs.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/ad-platforms/campaigns';
const BACK = '/admin/marketing/ad-platforms';
const API = '/api/admin/marketing/ad-platforms/campaigns';
const CONTROL_API = '/api/admin/marketing/ad-platforms/control';
const KEY = 'marketingAdCampaigns';
const OPEN = ['DRAFT', 'PRACTICE', 'FAILED', 'REJECTED', 'EXPIRED'];

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'adp.build.metaTitle'), robots: { index: false, follow: false } };
}

export default async function NewCampaignsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="adc-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const o = await builderOverview({ db: access.deps.db, resolver: access.deps.resolver });
  const canControl = access.guard.permissions?.has('marketing.ads.control') ?? false;
  const canApprove = access.guard.permissions?.has('marketing.ads.approve') ?? false;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `adp.build.${k}`, vars);
  const cp = (k: string, vars?: Record<string, string | number>) => t(d, `adp.control.${k}`, vars);
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone }).format(new Date(iso));
  const errs = Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'STALE', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, t(d, `adp.err.${k}`)]));
  const err = { ...errs, BUILDER_OFF: g('err.OFF'), ...Object.fromEntries(['CONTROL_OFF', 'LOCKED', 'WAITING'].map((k) => [k, g(`err.${k}`)])) };
  const field = Object.fromEntries(['adAccountId', 'campaignId', 'name', 'dailyBudgetMinor', 'startAt', 'endAt'].map((k) => [k, g(`field.${k}`)]));
  const on = o.card.value.enabled;
  const canWrite = on && canControl && o.accounts.length > 0;
  const platformName = (p: string | null) => (p ? t(d, `adp.platform.${p}`) : t(d, 'adp.gone'));
  const accounts = o.accounts.map((a) => ({ id: a.id, label: `${platformName(a.platform)} · ${a.name} (${a.currency})`, scale: 10 ** moneyOf(a.currency, view.locale).digits }));
  const objectives = CAMPAIGN_OBJECTIVES.map((v) => ({ value: v, label: g(`obj.${v}`) }));
  const formTexts: DraftFormTexts = { account: g('account'), campaign: g('campaign'), noCampaign: g('noCampaign'), name: g('name'), objective: g('objective'), budget: g('budget'), budgetHelp: g('budgetHelp'), start: g('start'), end: g('end'), scheduleHelp: g('scheduleHelp'), save: g('save'), saving: g('saving'), saved: g('saved'), err, field };
  const said = Object.fromEntries(['WAITING', 'duplicated', 'archived', 'restored'].map((k) => [k, g(`said.${k}`)]));
  const stepTexts: DraftStepTexts = { duplicate: g('duplicate'), launch: g('launch'), archive: g('archive'), restore: g('restore'), yes: g('yes'), cancel: g('cancel'), said, err, field };
  const ctlSaid = Object.fromEntries(['WAITING', 'PRACTICE', 'APPLIED', 'FAILED', 'REJECTED'].map((k) => [k, cp(`said.${k}`)]));
  const ctlErr = { ...errs, OFF: cp('err.OFF'), DECIDED: cp('err.DECIDED'), EXPIRED: cp('err.EXPIRED'), BUILDER_OFF: cp('err.BUILDER_OFF') };
  const money = (minor: number, cur: string) => formatMoney(minor, moneyOf(cur, view.locale));
  const span = (r: DraftRow) => g('scheduleLine', { from: r.startAt ? when(r.startAt) : g('now'), to: r.endAt ? when(r.endAt) : g('noEnd') });
  const pill = (st: string) => (st === 'CREATED' ? 'g' : st === 'FAILED' ? 'bad' : st === 'WAITING' ? 'warn' : st === 'PRACTICE' ? 'info' : 'line');
  const blank: DraftValues = { adAccountId: o.accounts[0]?.id ?? '', campaignId: null, name: '', objective: 'sales', dailyBudgetMinor: null, startWall: null, endWall: null };
  const cardTexts: FieldsCardTexts = { h: g('card.h'), d: g('card.d'), save: t(d, 'adp.spend.card.save'), saving: t(d, 'adp.spend.card.saving'), saved: t(d, 'adp.spend.card.saved'), discard: t(d, 'adp.spend.card.discard'), unsaved: t(d, 'adp.spend.card.unsaved'), readOnly: g('card.readOnly'), pairHelp: '', err: { ...errs } };
  const cardFields: FieldsCardField[] = [{ kind: 'switch', path: 'enabled', label: g('card.enabled'), help: g('card.enabledHelp') }];
  const row = (label: string, value: string, id?: string) => (
    <div>
      <dt className="a2-sm">{label}</dt>
      <dd className="a2-sm" data-testid={id}>
        {value}
      </dd>
    </div>
  );
  const item = (r: DraftRow) => {
    const open = OPEN.includes(r.status);
    const ranOut = r.ranOut;
    const launchText = g('confirmLaunch', { name: r.name, budget: r.dailyBudgetMinor === null ? g('noBudget') : money(r.dailyBudgetMinor, r.currency), from: r.startAt ? when(r.startAt) : g('now'), to: r.endAt ? when(r.endAt) : g('noEnd') });
    return (
      <li key={r.id} className="adp-rule" data-testid="adc-draft" data-status={r.status}>
        <p className="a2-sm adp-sub">{r.name}</p>
        <p className="a2-sm a2-mute">
          <span className={`a2-pill ${pill(r.status)}`}>{g(`status.${r.status}`)}</span> {when(r.createdAt)}
        </p>
        <dl className="adb-lines">
          {row(g('account'), g('accountLine', { platform: platformName(r.platform), account: r.accountName }))}
          {row(g('objective'), g(`obj.${r.objective}`))}
          {row(g('budget'), r.dailyBudgetMinor === null ? g('noBudget') : g('budgetLine', { budget: money(r.dailyBudgetMinor, r.currency) }), 'adc-budget-line')}
          {row(cp('schedule'), span(r), 'adc-window')}
          {r.campaignName ? row(g('campaign'), g('campaignLine', { name: r.campaignName })) : null}
          {r.copyOf ? row(g('duplicate'), g('copyOf', { name: r.copyOf })) : null}
        </dl>
        {r.status === 'WAITING' ? <p className="a2-sm a2-mute adb-mt8">{ranOut ? g('ranOut') : r.expiresAt ? g('expires', { when: when(r.expiresAt) }) : null}</p> : null}
        {r.status === 'WAITING' && r.requestId && canApprove && !ranOut ? (
          <AdControlDecide url={CONTROL_API} id={r.requestId} what={`${platformName(r.platform)} · ${r.name}: ${launchText}`} texts={{ approve: cp('approve'), reject: cp('reject'), confirmApprove: cp('confirmApprove'), confirmReject: cp('confirmReject'), yes: cp('yes'), cancel: cp('cancel'), said: ctlSaid, err: ctlErr }} />
        ) : null}
        {canControl && on && !r.archivedAt && (open || ranOut) ? (
          <details className="a2-more-opts adp-ctl adb-mt8" data-testid="adc-edit">
            <summary>{g('edit')}</summary>
            <DraftForm url={API} uid={r.id} accounts={accounts} campaigns={o.campaigns} objectives={objectives} nameMax={DRAFT_NAME_MAX} initial={{ id: r.id, version: r.version, adAccountId: r.adAccountId, campaignId: r.campaignId, name: r.name, objective: r.objective, dailyBudgetMinor: r.dailyBudgetMinor, startWall: r.startWall, endWall: r.endWall }} texts={formTexts} />
          </details>
        ) : null}
        {canControl && (on || r.archivedAt === null) ? <DraftStep url={API} id={r.id} canDup={on} canLaunch={on && o.controlOn && (open || ranOut)} launchText={launchText} archived={!!r.archivedAt} canEdit={r.archivedAt ? on : r.status !== 'WAITING' || ranOut} texts={stepTexts} /> : null}
      </li>
    );
  };

  return (
    <div className="a2-z" data-testid="adc-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="adb-mt8">
        <Link className="a2-sm adp-keys" href={BACK}>
          {g('back')}
        </Link>
      </p>
      <div className="a2-note" role="note">
        <span>{g('note')}</span>
      </div>
      {on && !o.controlOn ? (
        <div className="a2-note warn a2-mt12" role="note" data-testid="adc-control-off">
          <span>{g('controlOff')}</span>
        </div>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="adc-new-h" data-testid="adc-new">
        <h2 className="a2-h3" id="adc-new-h">
          {g('newH')}
        </h2>
        <p className="a2-sm a2-mute">{g('newD')}</p>
        {!on ? (
          <p className="a2-sm adb-mt8" data-testid="adc-off">
            {g('off')}
          </p>
        ) : !canControl ? (
          <p className="a2-sm a2-mute adb-mt8">{g('noWrite')}</p>
        ) : !o.accounts.length ? (
          <p className="a2-sm a2-mute adb-mt8">{g('noAccounts')}</p>
        ) : canWrite ? (
          <DraftForm url={API} uid="new" accounts={accounts} campaigns={o.campaigns} objectives={objectives} nameMax={DRAFT_NAME_MAX} initial={blank} texts={formTexts} />
        ) : null}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="adc-list-h" data-testid="adc-list">
        <h2 className="a2-h3" id="adc-list-h">
          {g('listH')}
        </h2>
        {o.drafts.length ? <ul className="adp-rules">{o.drafts.map(item)}</ul> : <p className="a2-sm a2-mute adb-mt8">{g('listNone')}</p>}
      </section>

      <details className="adc-fold a2-more-opts a2-mt12" data-testid="adc-aside">
        <summary>{g('asideH')}</summary>
        {o.setAside.length ? <ul className="adp-rules">{o.setAside.map(item)}</ul> : <p className="a2-sm a2-mute adb-mt8">{g('asideNone')}</p>}
      </details>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canApprove} testId="adc-card" />
      </div>
    </div>
  );
}
