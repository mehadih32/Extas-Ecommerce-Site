// PR 12 (CN-018, CN-022) — a section of the new admin whose pages are not built yet (Orders, Customers, Messages,
// Support, Marketing, Website, Money, Reports, AI Center, Settings): its honest placeholder at the section's own address
// (what it is for, the pages planned, and links to what of it is ready now), never a sample screen. Only someone who
// may open the section sees it (AI Center: owners only); any other address under /admin is "page not found".
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { Placeholder, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { placeholderSections, sectionVisible, type ShellViewer } from '@/lib/admin-shell/sections';
import { shellSession } from '@/lib/admin-shell/session';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

type Params = Promise<{ rest: string[] }>;

const sectionAt = (rest: string[]) => placeholderSections().find((s) => s.base === `/admin/${rest.join('/')}`) ?? null;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const view = await adminView();
  const section = sectionAt((await params).rest);
  const name = section ? t(view.dict, `shell.sec.${section.id}`) : t(view.dict, 'shell.state.notfound.title');
  return { title: `${name} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function SectionPlaceholder({ params }: { params: Params }) {
  const section = sectionAt((await params).rest);
  if (!section) notFound();
  const deps = adminDeps();
  const [view, access] = await Promise.all([adminView(deps), pageAccess(null, deps)]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(section.base)}`);
  if (access.kind !== 'ok') return <AdminNotice view={view} current={section.id} text={t(view.dict, 'page.noDb')} />;
  const s = await shellSession();
  const viewer: ShellViewer = s.kind === 'ok' ? { perms: s.perms, owner: s.owner } : { perms: new Set(), owner: false };
  if (!sectionVisible(section, viewer))
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission={section.perms?.[0] ?? null} />
      </div>
    );
  return <Placeholder view={view} section={section} viewer={viewer} />;
}
