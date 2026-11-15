// S16 · PR 352 — Reports → Team at /admin/reports/team (B3.10, Blueprint §59 answer 25: "team performance badges — build
// it, default off"): what each person did in this or the last week (Saturday to Friday) or month — orders confirmed,
// packed, handed to the courier, support replies — counted from the shop's own records, with the badges (the most in
// each, a minimum reached), and the badge settings. Seeing and changing need `staff.performance` (owner only as shipped).
// Recognition only: nothing here pays, takes away or changes anyone's access. Words: messages/admin-team.*.json.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ReportBar } from '@/components/admin/reports/ReportBar';
import { ReportTeamProto } from '@/components/admin/reports/ReportTeamProto';
import '@/components/admin/reports/report-bar.css';
import { TeamBadgesCard } from '@/components/admin/reports/TeamBadgesCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { loadBase, loadViews } from '@/lib/reports-v5/load';
import { loadTeam } from '@/lib/reports-v5/team';
import { withReportsV5 } from '@/lib/reports-v5/words';
import { teamView } from '@/lib/team-performance';
import bn from '../../../../../messages/admin-team.bn.json';
import en from '../../../../../messages/admin-team.en.json';
import '../../settings-cards.css';
import '../../money/money.css';
import '../delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsTeam';
const HERE = '/admin/reports/team';

function withScreen(view: AdminView): AdminView {
  const v = withReportsV5(view);
  return { ...v, dict: { ...v.dict, reportsTeam: (view.lang === 'bn' ? bn : en).reportsTeam as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'reportsTeam.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('staff.performance', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-lm-ready="" data-testid="team-page">
        <ShellState view={view} kind="denied" permission="staff.performance" />
      </div>
    );
  const c = (k: string, vars?: Record<string, string | number>) => t(view.dict, `reportsTeam.${k}`, vars);
  const pc = (k: string, vars?: Record<string, string | number>) => t(view.dict, `reportsV5.team.${k}`, vars);
  const cc = (k: string, vars?: Record<string, string | number>) => t(view.dict, `reportsV5.common.${k}`, vars);
  const base = await loadBase(access.deps, sp);
  const { q, notes } = base.period;
  const cmp = sp.cmp !== '0';
  const [data, views] = await Promise.all([loadTeam(access.deps, base.timeZone, q.from, q.to, base.before), loadViews(access, 'team')]);
  const f = makeFmt(view.locale, base.currency);
  const dtf = new Intl.DateTimeFormat(view.locale, { timeZone: base.timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' });
  const csv = `/api/admin/reports/export/team?from=${q.from}&to=${q.to}`;
  const back = sp.back === '1' ? 1 : 0;
  const v = await teamView(access.deps, MOTHER_STORE_ID, back);
  const s = v.settings.value;
  const day = (ymd: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T00:00:00Z`));
  const choices = s.period === 'week' ? (['thisWeek', 'lastWeek'] as const) : (['thisMonth', 'lastMonth'] as const);
  return (
    <div className="a2-z lm-rp" data-lm-ready="" data-testid="team-page">
      <PageHead view={view} place={locateKey(KEY)} title={cc('pageTitle')} sub={pc('sub')} />
      <SectionTabs view={view} current={KEY} />
      <ReportBar dict={view.dict} here={HERE} id="rp" from={q.from} to={q.to} today={base.today} p={typeof sp.p === 'string' ? sp.p : undefined} cmp={cmp} before={base.before} reportKey="team" views={views} day={f.dayShort} csv={csv} notes={notes} limitDays={base.limits.maxDays} />
      <ReportTeamProto data={data} cmp={cmp} c={pc} f={f} locale={view.locale} dt={(ms) => dtf.format(new Date(ms))} />
      <h2 className="a2-h3 a2-mt12">{pc('olderTitle')}</h2>
      {s.enabled ? (
        <section className="a2-card a2-mt12" aria-labelledby="team-rows" data-testid="team-rows">
          <div className="ct-actions">
            {choices.map((k, i) => (
              <Link key={k} href={i ? `${HERE}?back=1` : HERE} className={`a2-btn ${i === back ? 'pri' : ''}`} aria-current={i === back ? 'page' : undefined} data-testid={`team-${k}`}>
                {c(k)}
              </Link>
            ))}
          </div>
          <h2 className="a2-h3 a2-mt12" id="team-rows">
            {c('period', { from: day(v.from), to: day(v.to) })}
          </h2>
          {v.rows.length ? (
            v.rows.map((r) => (
              <div key={r.staffId} className="a2-rule" data-testid="team-row">
                <span>
                  <b>{r.name}</b>
                  <span className="a2-xs a2-mute cl-sub">{(['confirmed', 'packed', 'handedOver', 'replies'] as const).map((m) => `${c(`m.${m}`)}: ${r.counts[m]}`).join(' · ')}</span>
                  {r.badges.length ? (
                    <span className="cl-sub">
                      {r.badges.map((b) => (
                        <span key={`${b.measure}-${b.kind}`} className="a2-pill ok" style={{ marginInlineEnd: 6, marginTop: 4 }} data-testid="team-badge">
                          {c(`badge.${b.kind}`, { measure: c(`m.${b.measure}`) })}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </div>
            ))
          ) : (
            <p className="a2-xs a2-mute a2-mt12">{c('none')}</p>
          )}
        </section>
      ) : (
        <p className="a2-card a2-mt12 a2-sm" data-testid="team-off">
          {c('off')}
        </p>
      )}
      <TeamBadgesCard key={v.settings.version} dict={view.dict} value={s} version={v.settings.version} canEdit={access.guard.permissions?.has('staff.performance') ?? false} />
    </div>
  );
}
