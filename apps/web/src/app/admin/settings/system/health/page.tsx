// PR 791 — Settings › Site health at /admin/settings/system/health (prototype v5 m-settings.js `renderHealth`): six lights
// (shop up, nightly page check, backup, restore test, domain & SSL lock, version running) read from what the server already
// writes (lib/status.ts), what the server found, and where alerts go. A light with no data says "Not reported yet"; nothing is
// invented and nothing is switched here. Seeing needs `system.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { allGreen, lights } from '@/lib/admin-sysinfo/model';
import { buildId } from '@/lib/build-id';
import { t, type Dict } from '@/lib/i18n';
import { runtimeState } from '@/lib/status';
import bn from '../../../../../../messages/admin-sysinfo.bn.json';
import en from '../../../../../../messages/admin-sysinfo.en.json';
import '../../settings.css';
import '../sysinfo.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/system/health';
const KEY = 'siteHealth';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'sysinfo.health.metaTitle'), robots: { index: false, follow: false } };
}

export default async function SiteHealthPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('system.read', deps)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-lm-ready="" data-testid="sysinfo-health-page">
        <ShellState view={view} kind="denied" permission="system.read" />
      </div>
    );
  const d = view.dict;
  const h = (k: string, vars?: Record<string, string | number>) => t(d, `sysinfo.health.${k}`, vars);
  const state = await runtimeState();
  const now = new Date();
  const ls = lights(state, now, buildId());
  const notGreen = ls.filter((l) => l.tone === 'warn' || l.tone === 'bad').length;
  const problems = state.health?.problems ?? [];

  return (
    <div className="a2-z lm-st" data-lm-ready="" data-testid="sysinfo-health-page">
      <PageHead view={view} place={locateKey(KEY)} title={h('title')} sub={h('sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-sc a2-mt12" data-testid="sysinfo-lights" data-green={allGreen(ls) ? '1' : '0'}>
        <p className="a2-scd sy-sum">{notGreen ? h('needs', { n: notGreen }) : h('allGreen')}</p>
        <div className="sy-lights">
          {ls.map((l) => (
            <div className="sy-light" key={l.id} data-testid={`sysinfo-light-${l.id}`} data-tone={l.tone}>
              <i className={`sy-dot ${l.tone}`} aria-hidden="true" />
              <div>
                <b>{h(`light.${l.id}.n`)}</b>
                <span className="a2-scd sy-t">{h(`light.${l.id}.${l.variant}`, l.vars)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="sy-grid">
        <section className="a2-sc" data-testid="sysinfo-found">
          <h2 className="a2-h3">{h('found.h')}</h2>
          {problems.length ? (
            <ul className="sy-list">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="a2-scd">{state.health ? h('found.none') : h('empty')}</p>
          )}
          {state.health?.at ? <p className="a2-scd">{h('found.when', { when: dateTime(state.health.at, view.locale, view.timeZone) })}</p> : null}
        </section>
        <section className="a2-sc" data-testid="sysinfo-alerts">
          <h2 className="a2-h3">{h('alerts.h')}</h2>
          <p className="a2-scd">{h('alerts.d')}</p>
          <div className="sy-links">
            <Link className="a2-btn" href="/admin/settings/telegram-approvals">
              {h('alerts.telegram')}
            </Link>
            <Link className="a2-btn" href="/admin/settings/system/backups">
              {h('alerts.backups')}
            </Link>
            <Link className="a2-btn" href="/admin/settings/system/go-live">
              {h('alerts.golive')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
