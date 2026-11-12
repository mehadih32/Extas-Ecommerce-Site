// S12 · PR 529 (answer 12, 18 Oct; Blueprint §59 answers 11–14) — Website › Blog & journal › Write from a link at
// /admin/website/blog/source: a web address and a language; the writer reads the page, researches the topic and
// writes an original first draft, landing in the article editor marked AI-assisted with its source link kept.
// Seeing needs `blog.read`, writing `blog.write`, the "Write from a link" card `blog.publish`. Off as it ships, and
// needs AI on for the whole shop. Guide: docs/admin-guide/pages/website/blog-source.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { SourceLinkForm } from '@/components/admin/website/SourceLinkForm';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { sourceWriterView } from '@/lib/journal/source-link';
import bn from '../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../messages/admin-blog.en.json';
import '../../../settings-cards.css';
import '../blog.css';

export const dynamic = 'force-dynamic';

const BOARD = '/admin/website/blog';
const KEY = 'blogSource';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.src.meta'), robots: { index: false, follow: false } };
}

export default async function BlogSourceLinkPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent('/admin/website/blog/source')}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="blog-source" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="blog.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `jr.src.${k}`, vars);
  const screen = await sourceWriterView(access.deps.db, access.deps.resolver);
  const perms = access.guard.permissions;
  const canWrite = perms?.has('blog.write') ?? false;
  const canPublish = perms?.has('blog.publish') ?? false;
  const crumb = (
    <Link className="bd-crumb" href={BOARD} data-testid="src-back">
      {s('back')}
    </Link>
  );
  const words = { jr: (d as Record<string, Dict>).jr ?? {} } as Dict;
  const c = (k: string) => t(d, `jr.${k}`);
  const texts: FieldsCardTexts = {
    h: s('card.h'),
    d: s('card.d'),
    save: c('card.save'),
    saving: c('card.saving'),
    saved: c('card.saved'),
    discard: c('card.discard'),
    unsaved: c('card.unsaved'),
    readOnly: c('card.readOnly'),
    pairHelp: c('card.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, c(`err.${k}`)])),
  };

  return (
    <div className="a2-z" data-testid="blog-source" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current="blog" />
      <div className="jr-grid a2-mt12">
        <SourceLinkForm words={words} block={screen.block} used={screen.used} dailyMax={screen.dailyMax} canWrite={canWrite} />
        <div className="jr-stack">
          <FieldsCard
            url="/api/admin/blog/source-link"
            screen={{ key: screen.card.key, value: screen.card.value, version: screen.card.version }}
            fields={[
              { kind: 'switch', path: 'enabled', label: s('card.enabled') },
              { kind: 'number', path: 'dailyMax', label: s('card.dailyMax'), min: 1, max: 50 },
            ]}
            texts={texts}
            canEdit={canPublish}
            testId="src-settings"
          />
        </div>
      </div>
    </div>
  );
}
