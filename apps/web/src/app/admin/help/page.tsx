// PR 6 (follow-up 84), PR 12 — Help & manual (/admin/help): every section the person may open, with its Bengali guide
// (docs/admin-guide/, CN-014; the same guide opens from each page's "এই সেকশনে কী করা যায়" button), whether its new pages
// are ready or still planned, and a link into it. The guides are read from the server's deployed copy of the docs
// (GET /api/admin/help/<slug>). Reading needs `help.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, PlaceGuide, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey, SHELL_SECTIONS, sectionHome, sectionVisible, visibleTabs, type ShellPlace, type ShellViewer } from '@/lib/admin-shell/sections';
import { shellSession } from '@/lib/admin-shell/session';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/help';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'help.metaTitle'), robots: { index: false, follow: false } };
}

export default async function HelpPage() {
  const deps = adminDeps();
  const [view, access] = await Promise.all([adminView(deps), pageAccess('help.read', deps)]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="help" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="help.read" />
      </div>
    );
  const s = await shellSession();
  const viewer: ShellViewer = s.kind === 'ok' ? { perms: s.perms, owner: s.owner } : { perms: new Set(), owner: false };
  const d = view.dict;
  const here = locateKey('help');
  const sections = SHELL_SECTIONS.filter((x) => x.id !== 'help' && sectionVisible(x, viewer));

  return (
    <div className="a2-z" data-testid="help">
      <PageHead view={view} place={here} title={t(d, 'help.title')} sub={t(d, 'help.sub')} />
      <section className="a2-card" aria-label={t(d, 'help.title')}>
        {sections.map((sec) => {
          const place: ShellPlace = { section: sec, tab: null, page: null };
          const tabs = visibleTabs(sec, viewer);
          const ready = sec.id === 'dashboard' || tabs.length > 0;
          return (
            <div key={sec.id} className="a2-helprow" id={sec.guide} data-testid="help-row" data-section={sec.id}>
              <span className="a2-tki info">
                <ShellIcon name={sec.icon} size={16} />
              </span>
              <span className="a2-ht">
                <b>{t(d, `shell.sec.${sec.id}`)}</b>
                <i>{t(d, `shell.purpose.${sec.id}`)}</i>
              </span>
              <span className={`a2-pill ${ready ? 'ok' : 'line'}`}>{ready ? t(d, 'help.built') : t(d, 'help.planned')}</span>
              <PlaceGuide view={view} place={place} />
              <Link className="a2-btn" href={sectionHome(sec, viewer)}>
                {t(d, 'help.open')}
              </Link>
            </div>
          );
        })}
      </section>
    </div>
  );
}
