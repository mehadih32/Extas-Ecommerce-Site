// S13 · PR 262 (Blueprint C6.2 point 3, demo 97x-adm2-marketing.js "Ads › Audiences") — Marketing › Audiences at
// /admin/marketing/audiences: each audience with its conditions, how many people it held when last counted, when that
// was, the campaigns that use it and its state; views All / Archived; "New audience". Seeing needs
// `marketing.audiences.read`; creating needs `marketing.audiences.write`. Guide: docs/admin-guide/pages/marketing/audiences.md.
// PR 263: "New lookalike" (a seed of the people delivered to, valued by delivered sales) and the sending card
// (`ads.audiences`: the switch, off as it ships; the lookalike's countries and size per platform; each platform's floor).
// PR 264: the shop's exclusion list (people who refused a parcel) always first with its "Leave out" pill, and two more
// cards: the exclusion list (`ads.refusedExclude`, off) and the daily refresh (`ads.audienceRefresh`, off).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AUDIENCE_FLOOR_MAX, HOUR_MAX, REFUSED_DAYS_MAX } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { AUDIENCE_KIND_EXCLUSION, AUDIENCE_KIND_LOOKALIKE, ruleWords } from '@/lib/marketing/audience-model';
import { audienceCard, exclusionAudience } from '@/lib/marketing/audience-push';
import { audienceChoices, audienceList } from '@/lib/marketing/audiences';
import bn from '../../../../../messages/admin-audiences.bn.json';
import en from '../../../../../messages/admin-audiences.en.json';
import '../../settings-cards.css';
import '../landing/landing.css';
import './audiences.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/audiences';
const KEY = 'marketingAudiences';
const VIEWS = ['all', 'archived'] as const;
const SETTINGS_API = '/api/admin/marketing/audiences/settings';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'au.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ v?: string }> };

export default async function AudiencesPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('marketing.audiences.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="audiences-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.audiences.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `au.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const canWrite = access.guard.permissions?.has('marketing.audiences.write') ?? false;
  const v = (VIEWS as readonly string[]).includes(sp.v ?? '') ? (sp.v as (typeof VIEWS)[number]) : 'all';
  // PR 264: the exclusion list is always on the list (made and counted the first time it is needed)
  await exclusionAudience(access.deps.db, access.deps.resolver);
  const [list, choices, timeZone, card, refused, refresh] = await Promise.all([
    audienceList(access.deps.db),
    audienceChoices(access.deps.db, access.deps.resolver),
    access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID }),
    audienceCard(access.deps.resolver, 'audiences'),
    audienceCard(access.deps.resolver, 'refused'),
    audienceCard(access.deps.resolver, 'refresh'),
  ]);
  const texts: FieldsCardTexts = {
    h: s('card.h'),
    d: s('card.d'),
    save: s('card.save'),
    saving: s('card.saving'),
    saved: s('card.saved'),
    discard: s('card.discard'),
    unsaved: s('card.unsaved'),
    readOnly: s('card.readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`, { fields: s('field.value') })])),
  };
  const sizes = ['', 'narrow', 'balanced', 'broad'].map((x) => ({ value: x, label: s(`card.size.${x || 'none'}`) }));
  const fields: FieldsCardField[] = [
    { kind: 'switch', path: 'push', label: s('card.push'), help: s('card.pushHelp') },
    { kind: 'text', path: 'countries', label: s('card.countries'), help: s('card.countriesHelp'), max: 60 },
    { kind: 'select', path: 'metaPercent', label: s('card.metaPercent'), numeric: true, options: Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: i ? `${i}%` : s('card.size.none') })) },
    { kind: 'select', path: 'tiktokSize', label: s('card.tiktokSize'), options: sizes },
    { kind: 'select', path: 'googleSize', label: s('card.googleSize'), options: sizes },
    { kind: 'number', path: 'minMeta', label: s('card.minMeta'), help: s('card.minHelp'), min: 0, max: AUDIENCE_FLOOR_MAX },
    { kind: 'number', path: 'minTiktok', label: s('card.minTiktok'), min: 0, max: AUDIENCE_FLOOR_MAX },
    { kind: 'number', path: 'minGoogle', label: s('card.minGoogle'), min: 0, max: AUDIENCE_FLOOR_MAX },
  ];
  const refusedFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: s('cardRefused.on'), help: s('cardRefused.onHelp') },
    { kind: 'switch', path: 'everyRefusal', label: s('cardRefused.every'), help: s('cardRefused.everyHelp') },
    { kind: 'number', path: 'days', label: s('cardRefused.days'), help: s('cardRefused.daysHelp'), min: 0, max: REFUSED_DAYS_MAX },
  ];
  const refreshFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: s('cardRefresh.on'), help: s('cardRefresh.onHelp') },
    { kind: 'number', path: 'hour', label: s('cardRefresh.hour'), help: s('cardRefresh.hourHelp'), min: 0, max: HOUR_MAX },
  ];
  const exclWhen = refused.value.days ? s('lastDays', { days: refused.value.days }) : s('anyTime');
  const exclSum = refused.value.everyRefusal ? s('excl.sumEvery', { when: exclWhen }) : s('excl.sumListed');
  const names = new Map([...choices.sizes.map((x) => [x.id, x.label] as const), ...choices.grades.map((x) => [x.id, (view.lang === 'bn' && x.nameBn) || x.nameEn] as const)]);
  const day = (iso: string) => new Intl.DateTimeFormat(view.locale, { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' }).format(new Date(iso));
  const rows = list.filter((r) => (v === 'archived' ? r.state === 'ARCHIVED' : r.state !== 'ARCHIVED'));

  return (
    <div className="a2-z" data-testid="audiences-page" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={s('title')}
        sub={s('sub')}
        right={
          canWrite ? (
            <>
              <Link className="a2-btn" href={`${HERE}/new?kind=lookalike`} data-testid="au-create-lal">
                {s('lal.new')}
              </Link>
              <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="au-create">
                {s('new')}
              </Link>
            </>
          ) : undefined
        }
      />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        {s('note')}
      </div>
      <nav className="a2-views lp-views a2-mt12" aria-label={s('title')}>
        {VIEWS.map((n) => (
          <Link key={n} className={`a2-view${v === n ? ' on' : ''}`} href={n === 'all' ? HERE : `${HERE}?v=${n}`} aria-current={v === n ? 'page' : undefined}>
            {s(`views.${n}`)}
          </Link>
        ))}
      </nav>
      {rows.length ? (
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl" data-testid="au-table">
            <thead>
              <tr>
                <th>{s('col.audience')}</th>
                <th className="r">{s('col.people')}</th>
                <th>{s('col.counted')}</th>
                <th className="r">{s('col.campaigns')}</th>
                <th>{s('col.state')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="au-row">
                  <td>
                    <Link className="a2-b lp-name" href={`${HERE}/${r.id}`}>
                      {r.kind === AUDIENCE_KIND_EXCLUSION ? s('excl.name') : r.name}
                    </Link>
                    {r.kind === AUDIENCE_KIND_EXCLUSION ? (
                      <span className={`a2-pill au-excl${refused.value.on ? ' bad' : ''}`} data-testid="au-excl-pill">
                        {s('excl.pill')}
                        {refused.value.on ? '' : ` · ${s('excl.off')}`}
                      </span>
                    ) : null}
                    <span className="a2-xs a2-mute au-rules-sum">{r.kind === AUDIENCE_KIND_EXCLUSION ? exclSum : r.kind === AUDIENCE_KIND_LOOKALIKE ? s('lal.sum', { days: r.seedDays ?? 0 }) : r.rules.map((x) => ruleWords(x, s, names)).join('; ')}</span>
                  </td>
                  <td className="r a2-num">{r.size == null ? s('never') : num(r.size)}</td>
                  <td className="a2-sm">{r.countedAt ? day(r.countedAt) : s('never')}</td>
                  <td className="r a2-num">{num(r.campaigns)}</td>
                  <td>
                    <span className={`a2-pill${r.state === 'ACTIVE' ? ' ok' : ''}`}>{s(`state.${r.state}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-card a2-mt12 lp-empty" data-testid="au-empty">
          <b>{s('empty')}</b>
          <p className="a2-sm a2-mute">{s('emptySub')}</p>
        </div>
      )}
      <div id="au-settings" className="a2-mt12">
        <FieldsCard url={SETTINGS_API} screen={{ key: card.key, value: card.value, version: card.version }} fields={fields} texts={texts} canEdit={canWrite} testId="au-settings" />
      </div>
      <div id="au-refused" className="a2-mt12">
        <FieldsCard url={SETTINGS_API} screen={{ key: refused.key, value: refused.value, version: refused.version }} fields={refusedFields} texts={{ ...texts, h: s('cardRefused.h'), d: s('cardRefused.d') }} canEdit={canWrite} testId="au-refused" />
      </div>
      <div id="au-refresh" className="a2-mt12">
        <FieldsCard url={SETTINGS_API} screen={{ key: refresh.key, value: refresh.value, version: refresh.version }} fields={refreshFields} texts={{ ...texts, h: s('cardRefresh.h'), d: s('cardRefresh.d') }} canEdit={canWrite} testId="au-refresh" />
      </div>
    </div>
  );
}
