// S12 · PR 240 (Blueprint WEB-03a, demo 94-admin-blog.js) — /admin/website/blog/<id> (`new` for a new article): the
// article editor with its preview, its steps and its review history (components/admin/website/JournalEditor.tsx).
// Seeing needs `blog.read`, writing `blog.write`, the publishing steps `blog.publish`.
// Guide: docs/admin-guide/pages/website/blog-editor.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { JournalEditor, type EditorPost } from '@/components/admin/website/JournalEditor';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { journalChoices, journalPost } from '@/lib/journal/journal';
import { actionsFor } from '@/lib/journal/model';
import bn from '../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../messages/admin-blog.en.json';
import '@/components/journal/article.css';
import '../../../settings-cards.css';
import '../blog.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/website/blog';
const KEY = 'blogPost';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.editorMeta'), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ id: string }> };

export default async function JournalEditorPage(props: Props) {
  const deps = adminDeps();
  const [{ id }, plain] = await Promise.all([props.params, adminView(deps)]);
  const here = `${LIST}/${encodeURIComponent(id)}`;
  const access = await pageAccess('blog.read', deps, MOTHER_STORE_ID);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="blog.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `jr.${k}`, vars);
  const crumb = (
    <Link className="bd-crumb" href={LIST} data-testid="jr-back">
      {s('e.back')}
    </Link>
  );
  const isNew = id === 'new';
  const [post, choices, reading] = await Promise.all([isNew ? Promise.resolve(null) : journalPost(access.deps.db, id), journalChoices(access.deps.db), access.deps.resolver.value('blog.journal', { storeId: MOTHER_STORE_ID })]);
  if (!isNew && !post)
    return (
      <div className="a2-z">
        <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={s('editorMeta')} />
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const perms = access.guard.permissions;
  const start: EditorPost = post ?? {
    id: null,
    locale: view.lang,
    slug: '',
    title: '',
    excerpt: null,
    body: '',
    status: 'DRAFT',
    featured: false,
    categoryId: null,
    authorId: null,
    metaDescription: null,
    focusKeyword: null,
    quickAnswer: null,
    productIds: [],
    scheduledAt: null,
    live: false,
    actions: actionsFor('DRAFT'),
    gaps: [],
    reviews: [],
    version: null,
  };
  const words = { jr: (d as Record<string, Dict>).jr ?? {} } as Dict;

  return (
    <div className="a2-z" data-testid="blog-editor">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={crumb}
        title={post ? post.title : s('newTitle')}
        sub={post ? s('e.count', { words: post.wordCount, min: post.readingMinutes }) : undefined}
        right={
          post ? (
            // PR 547: the article's main photo (own pictures only)
            <Link className="a2-btn" href={`${here}/photo`} data-testid="jr-photo-link">
              {s('ph.open')}
            </Link>
          ) : undefined
        }
      />
      <SectionTabs view={view} current={KEY} />
      <JournalEditor
        words={words}
        post={start}
        categories={choices.categories}
        authors={choices.authors}
        products={choices.products}
        reading={reading}
        lang={view.lang}
        locale={view.locale}
        timeZone={view.timeZone}
        canWrite={perms?.has('blog.write') ?? false}
        canPublish={perms?.has('blog.publish') ?? false}
        listHref={LIST}
      />
    </div>
  );
}
