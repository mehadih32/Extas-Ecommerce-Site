// S12 · PR 240 (Blueprint C11.3, C11.4) — Website › Blog & journal › Categories & authors at
// /admin/website/blog/shelves: the journal's main categories and sub-categories, and the authors its articles are
// signed with (an AI author always labelled as one); add, edit, put away and restore, never deleted
// (components/admin/website/JournalShelf.tsx). Seeing needs `blog.read`, changing `blog.write`.
// Guide: docs/admin-guide/pages/website/blog-shelves.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { JournalShelf } from '@/components/admin/website/JournalShelf';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { journalAuthors, journalCategories } from '@/lib/journal/journal';
import bn from '../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../messages/admin-blog.en.json';
import '../../../settings-cards.css';
import '../blog.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/blog/shelves';
const KEY = 'blogShelves';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.sh.meta'), robots: { index: false, follow: false } };
}

export default async function JournalShelvesPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="blog-shelves" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="blog.read" />
      </div>
    );
  const s = (k: string) => t(d, `jr.${k}`);
  const canWrite = access.guard.permissions?.has('blog.write') ?? false;
  const [categories, authors] = await Promise.all([journalCategories(access.deps.db), journalAuthors(access.deps.db)]);
  const words = { jr: (d as Record<string, Dict>).jr ?? {} } as Dict;
  const crumb = (
    <Link className="bd-crumb" href="/admin/website/blog">
      {s('e.back')}
    </Link>
  );

  return (
    <div className="a2-z" data-testid="blog-shelves" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={s('sh.title')} sub={s('sh.sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="jr-grid a2-mt12">
        <section className="a2-card a2-sc" aria-labelledby="jr-sh-cats">
          <h2 className="a2-h3" id="jr-sh-cats">
            {s('sh.cats')}
          </h2>
          <p className="a2-cs">{s('sh.catsSub')}</p>
          <JournalShelf kind="categories" words={words} rows={categories} canWrite={canWrite} lang={view.lang} />
        </section>
        <section className="a2-card a2-sc" aria-labelledby="jr-sh-authors">
          <h2 className="a2-h3" id="jr-sh-authors">
            {s('sh.authors')}
          </h2>
          <p className="a2-cs">{s('sh.authorsSub')}</p>
          <JournalShelf kind="authors" words={words} rows={authors} canWrite={canWrite} lang={view.lang} />
        </section>
      </div>
    </div>
  );
}
