// S15 · PR 340 (Blueprint D5.2 "a funnel per product"; REP-10; demo 97y-adm2-reports.js "REP-10 Funnels") — Reports
// › More › Funnels at /admin/reports/funnels (?funnel=<id>&days=7|30|90): the second half of the +4-PR run, on PR
// 338's own event layer and PR 339's own funnel CRUD/computation, which this page only reads — nothing here saves
// or changes anything except the one-tap "create the shop funnel" default shown while the store has no saved
// funnel yet (`reports.analytics.write`). Seeing needs `reports.read`. Matches the demo's own fixed "Shop funnel"
// bar chart; the demo's separate "Per page" comparison table is a stated, deliberate gap (see PROGRESS.md) — no
// per-page breakdown is built here yet, left for a follow-up once a second, page-scoped funnel is a real need.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { pct } from '@/components/admin/courier-report/PerfTable';
import { CreateDefaultFunnelButton } from '@/components/admin/reports/CreateDefaultFunnelButton';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { defaultFunnelInput } from '@/lib/analytics/default-funnel';
import { listFunnels } from '@/lib/analytics/funnel-list';
import { defaultFunnelWindow, runFunnel } from '@/lib/analytics/funnel-run';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-funnels.bn.json';
import en from '../../../../../messages/admin-funnels.en.json';

export const dynamic = 'force-dynamic';

const KEY = 'reportsFunnels';
const HERE = '/admin/reports/funnels';
const PERIODS = [7, 30, 90] as const;
const DAY_MS = 86_400_000;

function withScreen<T extends { lang: string; dict: Dict }>(view: T): T {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'fn.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function FunnelsPage({ searchParams }: { searchParams: Promise<{ funnel?: string; days?: string }> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('reports.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `fn.${k}`, vars);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-lm-ready="" data-testid="fn-page">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );

  const canWrite = access.guard.permissions?.has('reports.analytics.write') ?? false;
  const funnels = await listFunnels({ db: access.deps.db }, MOTHER_STORE_ID);
  const days = (PERIODS as readonly number[]).includes(Number(sp.days)) ? Number(sp.days) : 30;
  const current = funnels.find((f) => f.id === sp.funnel) ?? funnels[0] ?? null;
  const now = access.deps.now?.() ?? new Date();
  const window = defaultFunnelWindow(now, new Date(now.getTime() - days * DAY_MS), now);
  const result = current ? await runFunnel({ db: access.deps.db }, MOTHER_STORE_ID, current.id, window) : null;
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const day = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', numberingSystem: 'latn' });
  const def = defaultFunnelInput(lang);

  return (
    <div className="a2-z lm-rp" data-lm-ready="" data-testid="fn-page" data-days={days}>
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      {!funnels.length ? (
        <section className="a2-card a2-mt12" data-testid="fn-none">
          <p className="a2-sm">{g('noneYet')}</p>
          {canWrite ? <CreateDefaultFunnelButton name={def.name} steps={def.steps} label={g('createDefault')} createdText={g('created')} failedText={g('createFailed')} /> : null}
        </section>
      ) : (
        <>
          {funnels.length > 1 ? (
            <nav className="a2-views a2-mt12" aria-label={g('funnelLabel')} data-testid="fn-select">
              {funnels.map((f) => (
                <a key={f.id} className={`a2-view${current && f.id === current.id ? ' on' : ''}`} href={`${HERE}?funnel=${f.id}&days=${days}`} aria-current={current && f.id === current.id ? 'page' : undefined}>
                  {f.name}
                </a>
              ))}
            </nav>
          ) : null}
          <nav className="a2-views a2-mt12" aria-label={g('period.label')}>
            {PERIODS.map((p) => (
              <a key={p} className={`a2-view${p === days ? ' on' : ''}`} href={`${HERE}?funnel=${current?.id ?? ''}&days=${p}`} aria-current={p === days ? 'page' : undefined}>
                {g(`period.d${p}`)}
              </a>
            ))}
          </nav>
          {result ? (
            <>
              <p className="a2-xs a2-mute" data-testid="fn-range">
                {g('range', { from: day.format(new Date(result.from)), to: day.format(new Date(result.to)) })}
              </p>
              <section className="a2-card a2-mt12" data-testid="fn-steps">
                <h2 className="a2-h3">{result.funnel.name}</h2>
                <p className="a2-xs a2-mute a2-mt6">{g('stepsSub')}</p>
                <div className="a2-tblw a2-mt12">
                  <table className="a2-tbl" data-testid="fn-steps-table">
                    <thead>
                      <tr>
                        <th>{g('step')}</th>
                        <th className="r">{g('visitors')}</th>
                        <th className="r">{g('fromPrevious')}</th>
                        <th className="r">{g('fromFirst')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.steps.map((s) => (
                        <tr key={s.key} data-testid="fn-step-row">
                          <td className="a2-tdh">
                            <b>{s.label}</b>
                          </td>
                          <td className="r" data-l={g('visitors')}>
                            {n(s.visitors)}
                          </td>
                          <td className="r" data-l={g('fromPrevious')}>
                            {pct(s.conversionFromPrevious, view.locale)}
                          </td>
                          <td className="r" data-l={g('fromFirst')}>
                            {pct(s.conversionFromFirst, view.locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </>
      )}
      <p className="a2-xs a2-mute a2-mt12">{g('note')}</p>
    </div>
  );
}
