// S12 · PR 242 (Blueprint C4.5 "topical cluster planner", C11.2; demo 94-admin-blog.js topics tab) — Website › Blog &
// journal › Topic plan at /admin/website/blog/plan: the clusters (a pillar article and its supporting articles, all
// pointing at one shop page) with the links each article still lacks, the topics still to write (the owner's yes or
// no; "Start writing" makes the draft inside the cluster), the articles in no cluster, the forms for a new topic and a
// new cluster, and the link rules card (`blog.clusters`: refusing to publish is off as it ships).
// PR 244 (S12 answer 11; 19 Oct): the approval queue on top — the topics waiting for the owner's yes, month by month,
// with "Approve the whole month" (a very close one held), the digest of what was decided by itself, and the card
// `blog.approval` (the owner decides as it ships; "by itself" approves topics and can publish finished articles).
// Seeing needs `blog.read`, changing `blog.write`, deciding topics and the card `blog.publish`.
// Guide: docs/admin-guide/pages/website/blog-plan.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ClusterPlanner } from '@/components/admin/website/ClusterPlanner';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { clusterPlan } from '@/lib/journal/clusters';
import bn from '../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../messages/admin-blog.en.json';
import '../../../settings-cards.css';
import '../blog.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/blog/plan';
const KEY = 'blogPlan';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.pl.meta'), robots: { index: false, follow: false } };
}

export default async function TopicPlanPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="blog.read" />
      </div>
    );
  const s = (k: string) => t(d, `jr.${k}`);
  const l = (k: string) => s(`pl.${k}`);
  const perms = access.guard.permissions;
  const canWrite = perms?.has('blog.write') ?? false;
  const canPublish = perms?.has('blog.publish') ?? false;
  const plan = await clusterPlan(access.deps.db, access.deps.resolver);
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
  const kpis: [string, number, string][] = [
    ['kProposed', plan.counts.proposed, plan.counts.proposed ? ' warn' : ''],
    ['kApproved', plan.counts.approved, ''],
    ['kWriting', plan.counts.writing, ''],
    ['kGaps', plan.counts.gaps, plan.counts.gaps ? ' warn' : ' ok'],
  ];
  const crumb = (
    <Link className="bd-crumb" href="/admin/website/blog">
      {s('e.back')}
    </Link>
  );

  return (
    <div className="a2-z" data-testid="blog-plan">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={l('title')} sub={l('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="pl-kpis a2-mt12" data-testid="pl-kpis">
        {kpis.map(([k, n, tone]) => (
          <div key={k} className={`a2-card pl-k${tone}`}>
            <div className="pl-v">{n}</div>
            <div className="a2-sm">{l(k)}</div>
            <div className="a2-xs a2-mute">{l(`${k}S`)}</div>
          </div>
        ))}
      </div>
      <div className="jr-grid a2-mt12">
        <div className="jr-stack">
          <ClusterPlanner part="queue" words={words} plan={plan} canWrite={canWrite} canPublish={canPublish} lang={view.lang} />
          <ClusterPlanner part="clusters" words={words} plan={plan} canWrite={canWrite} canPublish={canPublish} lang={view.lang} />
        </div>
        <div className="jr-stack">
          <ClusterPlanner part="forms" words={words} plan={plan} canWrite={canWrite} canPublish={canPublish} lang={view.lang} />
          <FieldsCard
            url="/api/admin/blog/clusters"
            screen={{ key: plan.card.key, value: plan.card.value, version: plan.card.version }}
            fields={[
              { kind: 'switch', path: 'requireLinks', label: l('card.requireLinks') },
              { kind: 'switch', path: 'linkPillar', label: l('card.linkPillar') },
              { kind: 'switch', path: 'linkTarget', label: l('card.linkTarget') },
              { kind: 'switch', path: 'pillarLinksAll', label: l('card.pillarLinksAll') },
              { kind: 'number', path: 'dupNear', label: l('card.dupNear'), min: 10, max: 100 },
              { kind: 'number', path: 'dupWarn', label: l('card.dupWarn'), min: 10, max: 100 },
            ]}
            texts={texts}
            canEdit={canPublish}
            testId="pl-settings"
          />
          <FieldsCard
            url="/api/admin/blog/clusters"
            screen={{ key: plan.approval.key, value: plan.approval.value, version: plan.approval.version }}
            fields={[
              {
                kind: 'select',
                path: 'mode',
                label: l('acard.mode'),
                options: [
                  { value: 'owner', label: l('acard.modeOwner') },
                  { value: 'auto', label: l('acard.modeAuto') },
                ],
              },
              { kind: 'switch', path: 'holdAlike', label: l('acard.holdAlike') },
              { kind: 'switch', path: 'autoPublish', label: l('acard.autoPublish') },
              { kind: 'number', path: 'digestDays', label: l('acard.digestDays'), min: 1, max: 31 },
            ]}
            texts={{ ...texts, h: l('acard.h'), d: l('acard.d') }}
            canEdit={canPublish}
            testId="pl-approval"
          />
          <section className="a2-card a2-sc" aria-labelledby="pl-how">
            <h2 className="a2-h3" id="pl-how">
              {l('how')}
            </h2>
            <ol className="pl-how a2-sm">
              {['how1', 'how2', 'how3', 'how4'].map((k) => (
                <li key={k}>{l(k)}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
