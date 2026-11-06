// S12 · PR 528 (S12 answer 11; BLOG-CONTENT-PLAN §5.1; demo 97x-adm2-website.js "Topics & briefs") — Website › Blog &
// journal › Brief at /admin/website/blog/briefs/<id> (`new`, `?topic=<id>` starts it from a plan topic): the topic,
// its language, how many words and the keywords, chosen before a single word is written, and what helps the writer;
// beside it the brief card (`blog.brief`: "Start writing needs the brief" off as it ships). Seeing needs `blog.read`,
// writing `blog.write`, the card `blog.publish`. Guide: docs/admin-guide/pages/website/blog-brief.md.
// PR 243: the AI first draft from the brief (in the form) and its card (`blog.aiDraft`, off as shipped).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { BriefForm } from '@/components/admin/website/BriefForm';
import { adminDeps, isUuid } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { briefScreen } from '@/lib/journal/briefs';
import bn from '../../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../../messages/admin-blog.en.json';
import '../../../../settings-cards.css';
import '../../blog.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/website/blog/briefs';
const PLAN = '/admin/website/blog/plan';
const KEY = 'blogBrief';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.br.meta'), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ topic?: string }> };

export default async function BlogBriefPage(props: Props) {
  const deps = adminDeps();
  const [{ id }, q, plain] = await Promise.all([props.params, props.searchParams, adminView(deps)]);
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
  const s = (k: string) => t(d, `jr.${k}`);
  const l = (k: string) => s(`br.${k}`);
  const crumb = (
    <Link className="bd-crumb" href={PLAN} data-testid="br-back">
      {l('back')}
    </Link>
  );
  const isNew = id === 'new';
  const screen = isNew || isUuid(id) ? await briefScreen(access.deps.db, access.deps.resolver, isNew ? null : id, q.topic && isUuid(q.topic) ? q.topic : null) : null;
  if (!screen)
    return (
      <div className="a2-z">
        <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={l('title')} />
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const perms = access.guard.permissions;
  const canWrite = perms?.has('blog.write') ?? false;
  const canPublish = perms?.has('blog.publish') ?? false;
  const words = { jr: (d as Record<string, Dict>).jr ?? {} } as Dict;
  const texts: FieldsCardTexts = {
    h: l('card.h'),
    d: l('card.d'),
    save: s('card.save'),
    saving: s('card.saving'),
    saved: s('card.saved'),
    discard: s('card.discard'),
    unsaved: s('card.unsaved'),
    readOnly: s('card.readOnly'),
    pairHelp: s('card.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`)])),
  };
  const title = screen.brief.topicTitle && !isNew ? `${l('title')}: ${screen.brief.topicTitle}` : isNew ? l('titleNew') : l('title');

  return (
    <div className="a2-z" data-testid="blog-brief">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={title} sub={l('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="jr-grid a2-mt12">
        <BriefForm key={screen.brief.version ?? 'new'} words={words} screen={screen} canWrite={canWrite} />
        <div className="jr-stack">
          <FieldsCard
            url="/api/admin/blog/briefs"
            screen={{ key: screen.card.key, value: screen.card.value, version: screen.card.version }}
            fields={[
              { kind: 'switch', path: 'requireForStart', label: l('card.requireForStart') },
              { kind: 'number', path: 'wordsDefault', label: l('card.wordsDefault'), min: 100, max: 10000 },
              { kind: 'number', path: 'wordsMin', label: l('card.wordsMin'), min: 100, max: 10000 },
              { kind: 'number', path: 'wordsMax', label: l('card.wordsMax'), min: 100, max: 10000 },
            ]}
            texts={texts}
            canEdit={canPublish}
            testId="br-settings"
          />
          <FieldsCard
            url="/api/admin/blog/briefs"
            screen={{ key: screen.aiCard.key, value: screen.aiCard.value, version: screen.aiCard.version }}
            fields={[
              { kind: 'switch', path: 'enabled', label: l('ai.card.enabled') },
              { kind: 'number', path: 'dailyMax', label: l('ai.card.dailyMax'), min: 1, max: 50 },
            ]}
            texts={{ ...texts, h: l('ai.card.h'), d: l('ai.card.d') }}
            canEdit={canPublish}
            testId="br-ai-settings"
          />
        </div>
      </div>
    </div>
  );
}
