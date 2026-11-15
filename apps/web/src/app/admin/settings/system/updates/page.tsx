// PR 791 — Settings › Updates & versions at /admin/settings/system/updates (prototype v5 m-settings.js `renderUpdates`): which
// version runs now, when it was installed, how updates arrive (only after every check, and the shop goes back by itself if the
// page check fails), the last good deploy and how much of the build is finished — all from what the server writes
// (lib/status.ts) and the build register. Nothing is switched here. Seeing needs `system.read`.
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
import { buildId } from '@/lib/build-id';
import { t, type Dict } from '@/lib/i18n';
import { buildStatus, runtimeState } from '@/lib/status';
import bn from '../../../../../../messages/admin-sysinfo.bn.json';
import en from '../../../../../../messages/admin-sysinfo.en.json';
import '../../settings.css';
import '../sysinfo.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/system/updates';
const KEY = 'updates';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'sysinfo.updates.metaTitle'), robots: { index: false, follow: false } };
}

export default async function UpdatesPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('system.read', deps)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-lm-ready="" data-testid="sysinfo-updates-page">
        <ShellState view={view} kind="denied" permission="system.read" />
      </div>
    );
  const d = view.dict;
  const u = (k: string, vars?: Record<string, string | number>) => t(d, `sysinfo.updates.${k}`, vars);
  const state = await runtimeState();
  const build = buildId();
  const dep = state.deploy;
  const when = dep?.at ? dateTime(dep.at, view.locale, view.timeZone) : null;
  const done = buildStatus.totals.done;
  const total = buildStatus.totals.active;
  const launch = buildStatus.launch;

  return (
    <div className="a2-z lm-st" data-lm-ready="" data-testid="sysinfo-updates-page">
      <PageHead view={view} place={locateKey(KEY)} title={u('title')} sub={u('sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-sc a2-mt12 sy-hero" data-testid="sysinfo-version">
        <i className="sy-dot ok" aria-hidden="true" />
        <div>
          <div className="sy-big">
            {u('version')} {build === 'dev' ? u('dev') : build}
          </div>
          <div className="a2-scd">{when ? u('installed', { when }) : u('notInstalled')}</div>
        </div>
      </section>

      <div className="sy-grid">
        <section className="a2-sc" data-testid="sysinfo-how">
          <h2 className="a2-h3">{u('how.h')}</h2>
          <p className="a2-scd">{u('how.d')}</p>
          <p className="a2-scd">{u('how.back')}</p>
          <div className="sy-links">
            <Link className="a2-btn" href="/admin/settings/system/backups">
              {u('how.go')}
            </Link>
          </div>
        </section>
        <section className="a2-sc" data-testid="sysinfo-last">
          <h2 className="a2-h3">{u('last.h')}</h2>
          {dep ? (
            <dl className="sy-dl">
              <dt>{u('last.commit')}</dt>
              <dd>{dep.sha ? dep.sha.slice(0, 7) : '—'}</dd>
              <dt>{u('last.at')}</dt>
              <dd>{when ?? '—'}</dd>
              {dep.color ? (
                <>
                  <dt>{u('last.color')}</dt>
                  <dd>{dep.color}</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="a2-scd">{u('last.none')}</p>
          )}
        </section>
      </div>

      <section className="a2-sc a2-mt12" data-testid="sysinfo-built">
        <h2 className="a2-h3">{u('build.h')}</h2>
        <p className="a2-scd">{u('build.d')}</p>
        <p>
          <b>{u('build.of', { done, total })}</b>
          {launch ? ` · ${u('build.launch', { done: launch.done, total: launch.total })}` : ''}
        </p>
        <div className="sy-links">
          <Link className="a2-btn" href="/admin/build">
            {u('build.list')}
          </Link>
        </div>
      </section>
    </div>
  );
}
