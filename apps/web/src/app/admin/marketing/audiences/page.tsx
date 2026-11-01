// S13 · PR 262 (Blueprint C6.2 point 3, demo 97x-adm2-marketing.js "Ads › Audiences") — Marketing › Audiences at
// /admin/marketing/audiences: each audience with its conditions, how many people it held when last counted, when that
// was, the campaigns that use it and its state; views All / Archived; "New audience". Seeing needs
// `marketing.audiences.read`; creating needs `marketing.audiences.write`. Nothing here sends a list to an ad platform.
// Guide: docs/admin-guide/pages/marketing/audiences.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { ruleWords } from '@/lib/marketing/audience-model';
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
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.audiences.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `au.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const canWrite = access.guard.permissions?.has('marketing.audiences.write') ?? false;
  const v = (VIEWS as readonly string[]).includes(sp.v ?? '') ? (sp.v as (typeof VIEWS)[number]) : 'all';
  const [list, choices, timeZone] = await Promise.all([audienceList(access.deps.db), audienceChoices(access.deps.db, access.deps.resolver), access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID })]);
  const names = new Map([...choices.sizes.map((x) => [x.id, x.label] as const), ...choices.grades.map((x) => [x.id, (view.lang === 'bn' && x.nameBn) || x.nameEn] as const)]);
  const day = (iso: string) => new Intl.DateTimeFormat(view.locale, { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' }).format(new Date(iso));
  const rows = list.filter((r) => (v === 'archived' ? r.state === 'ARCHIVED' : r.state !== 'ARCHIVED'));

  return (
    <div className="a2-z" data-testid="audiences-page">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={s('title')}
        sub={s('sub')}
        right={
          canWrite ? (
            <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="au-create">
              {s('new')}
            </Link>
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
                      {r.name}
                    </Link>
                    <span className="a2-xs a2-mute au-rules-sum">{r.rules.map((x) => ruleWords(x, s, names)).join('; ')}</span>
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
    </div>
  );
}
