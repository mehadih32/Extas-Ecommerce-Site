// S12 · PR 591 (register "Blog content pipeline"; BLOG-CONTENT-PLAN "3/day for 2 weeks, then 5/day only while quality and
// indexing stay healthy") — Website › Blog & journal › Pipeline at /admin/website/blog/pipeline, drawn in Lumen (CN-036:
// the shared patterns, --lm-* tokens only, data-lm-ready): today's pace and why, the journal's health, where every
// topic and article is, the days ready ahead and what to write next, the articles waiting for a step (stuck ones
// flagged; the writer never passes his own), the live articles due a refresh, and the card `blog.pipeline` (off as
// shipped). Each row opens its own page (the plan, the editor), where the existing permissions stay. The AI writer and
// proofreader wait for S15 (closed, PR 652). Seeing needs `blog.read`; the card `blog.publish`.
// Guide: docs/admin-guide/pages/website/blog-pipeline.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { Queue, type QueueRow } from '@/components/admin/lumen/Queue';
import { SettingCards } from '@/components/admin/lumen/SettingCards';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { FLOW, type FlowKey } from '@/lib/journal/pipeline-model';
import { pipelineScreen } from '@/lib/journal/pipeline';
import bn from '../../../../../../messages/admin-blog-pipeline.bn.json';
import en from '../../../../../../messages/admin-blog-pipeline.en.json';
import './pipeline.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/blog/pipeline';
const KEY = 'blogPipeline';
const BLOG = '/admin/website/blog';
/** Where each step of the flow opens. */
const FLOW_HREF: Record<FlowKey, string> = {
  topics: `${BLOG}/plan`,
  approved: `${BLOG}/plan`,
  writing: BLOG,
  proofread: BLOG,
  factChecked: BLOG,
  finished: `${BLOG}/calendar`,
  scheduled: `${BLOG}/calendar`,
};

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'bp.meta'), robots: { index: false, follow: false } };
}

export default async function BlogPipelinePage() {
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
  const l = (k: string, vars?: Record<string, string | number>) => t(d, `bp.${k}`, vars);
  const canPublish = access.guard.permissions?.has('blog.publish') ?? false;
  const [r, sch] = await Promise.all([pipelineScreen(access.deps.db, access.deps.resolver, new Date()), access.deps.resolver.value('blog.schedule', { storeId: MOTHER_STORE_ID })]);
  const set = r.card.value;
  const num = (n: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(n);
  const dayText = (ymd: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T00:00:00Z`));
  const fmt = { kind: 'number', locale: view.locale } as const;
  const waiting = r.flow.writing + r.flow.proofread + r.flow.factChecked;
  const tiles: SummaryTile[] = [
    { key: 'pace', label: l('tPace'), value: r.pace.perDay, shown: num(r.pace.perDay), format: fmt, icon: 'cal' },
    { key: 'buffer', label: l('tBuffer'), value: r.supply.days, shown: num(r.supply.days), format: fmt, icon: 'layers' },
    { key: 'review', label: l('tReview'), value: waiting, shown: num(waiting), format: fmt, icon: 'edit' },
    { key: 'stuck', label: l('tStuck'), value: r.stuck, shown: num(r.stuck), format: fmt, icon: 'clock' },
  ];
  const ago = (n: number) => (n === 0 ? l('today') : n === 1 ? l('day1') : l('days', { n: num(n) }));
  const reviewRows: QueueRow[] = r.review.map((x) => ({
    id: x.id,
    title: x.title,
    sub: (
      <span className="bp-meta">
        <span>{l(`step_${x.step}`)}</span>
        {x.writer ? <span>{l('writer', { name: x.writer })}</span> : null}
        {x.stuck ? <span className="bp-pill warn">{l('stuckTag')}</span> : null}
      </span>
    ),
    meta: ago(x.waitingDays),
    act: { kind: 'blog.open', label: l('open'), href: x.href },
  }));
  const nextRows: QueueRow[] = r.writeNext.map((x) => ({
    id: x.id,
    title: x.title,
    sub: (
      <span className="bp-meta">
        <span>{l('prio', { n: num(x.priority) })}</span>
        <span>{x.locale.toUpperCase()}</span>
        {x.pillar ? <span className="bp-pill">{l('pillar')}</span> : null}
      </span>
    ),
    act: { kind: 'blog.open', label: l('openPlan'), href: `${BLOG}/plan` },
  }));
  const refreshRows: QueueRow[] = r.refresh.map((x) => ({
    id: x.id,
    title: x.title,
    sub: <span className="bp-meta">{x.locale.toUpperCase()}</span>,
    meta: ago(x.ageDays),
    act: { kind: 'blog.open', label: l('open'), href: x.href },
  }));
  const reason = r.pace.reason === 'starting' && r.pace.fullFrom ? l('reason_starting', { d: dayText(r.pace.fullFrom) }) : l(`reason_${r.pace.reason}`);

  return (
    <div className="a2-z bp-page" data-testid="blog-pipeline" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={
          <Link className="bp-crumb" href={BLOG}>
            {l('back')}
          </Link>
        }
        title={l('title')}
        sub={l('sub')}
      />
      <SectionTabs view={view} current={KEY} />
      {set.on ? null : (
        <p className="lm-card bp-off" role="note" data-testid="bp-off">
          {l('off', { n: num(sch.perDayTarget) })}
        </p>
      )}
      <SummaryTiles tiles={tiles} label={l('tiles')} testId="bp-tiles" />
      <div className="bp-grid">
        <div className="bp-stack">
          <section className="lm-card" aria-labelledby="bp-pace-h" data-testid="bp-pace">
            <h2 className="lm-h2" id="bp-pace-h">
              {l('pace')}
            </h2>
            <p className="bp-big">{l('perDay', { n: num(r.pace.perDay) })}</p>
            <p className="bp-span">{reason}</p>
            {r.paceNext ? <p className="bp-span">{l('nextPace', { d: dayText(r.paceNext.day), n: num(r.paceNext.perDay) })}</p> : null}
            <p className="bp-span" data-testid="bp-buffer">
              {l('buffer', { have: num(r.supply.have), want: num(r.supply.want), d: num(r.supply.days) })}{' '}
              {r.supply.short ? l('bufferShort', { n: num(r.supply.short), b: num(set.bufferDays) }) : l('bufferFull')}
            </p>
          </section>
          <section className="lm-card" aria-labelledby="bp-flow-h" data-testid="bp-flow">
            <h2 className="lm-h2" id="bp-flow-h">
              {l('flow')}
            </h2>
            <p className="bp-span">{l('flowSub')}</p>
            <ol className="bp-flow">
              {FLOW.map((k) => (
                <li key={k}>
                  <Link className="bp-step" href={FLOW_HREF[k]} data-testid={`bp-f-${k}`}>
                    <span className="bp-step-n">{num(r.flow[k])}</span>
                    <span className="bp-step-l">{l(`f_${k}`)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
          <Queue
            title={l('review')}
            sub={`${l('reviewSub', { n: num(r.stuck), d: num(set.stuckDays) })}${r.reviewByAnother ? ` ${l('reviewSubOwn')}` : ''}`}
            rows={reviewRows}
            empty={{ title: l('reviewEmpty'), text: l('reviewEmptyText') }}
            refresh={false}
            testId="bp-review"
          />
          <Queue title={l('next')} sub={l('nextSub')} rows={nextRows} empty={{ title: l('nextEmpty'), text: l('nextEmptyText') }} refresh={false} testId="bp-next" />
          <Queue
            title={l('refresh')}
            sub={l('refreshSub', { n: num(set.refreshDays) })}
            rows={refreshRows}
            empty={{ title: l('refreshEmpty'), text: l('refreshEmptyText') }}
            refresh={false}
            testId="bp-refresh"
          />
        </div>
        <div className="bp-stack">
          <section className="lm-card" aria-labelledby="bp-health-h" data-testid="bp-health">
            <h2 className="lm-h2 bp-h-row" id="bp-health-h">
              {l('health')}
              <span className={`bp-pill ${r.health.healthy ? 'ok' : 'warn'}`}>{r.health.healthy ? l('healthy') : l('notHealthy')}</span>
            </h2>
            <p className="bp-span">{l('healthSub', { n: num(set.healthDays) })}</p>
            <ul className="bp-list">
              <li>{r.health.backPct === null ? l('backNone') : l('backPct', { p: num(r.health.backPct), max: num(set.maxBackPct) })}</li>
              <li>{l(`idx_${r.health.indexing}`)}</li>
            </ul>
          </section>
          {canPublish ? (
            <SettingCards
              save={{ method: 'PUT', url: '/api/admin/blog/pipeline' }}
              cards={[
                {
                  key: r.card.key,
                  title: l('card'),
                  text: l('cardText'),
                  on: set.on,
                  fields: [
                    { name: 'startPerDay', label: l('startPerDay'), kind: 'number', value: set.startPerDay, min: 1, max: 24, step: 1, unit: l('unitPerDay') },
                    { name: 'fullPerDay', label: l('fullPerDay'), kind: 'number', value: set.fullPerDay, min: 1, max: 24, step: 1, unit: l('unitPerDay') },
                    { name: 'rampDays', label: l('rampDays'), kind: 'number', value: set.rampDays, min: 0, max: 365, step: 1, unit: l('unitDays') },
                    { name: 'healthDays', label: l('healthDays'), kind: 'number', value: set.healthDays, min: 1, max: 90, step: 1, unit: l('unitDays') },
                    { name: 'maxBackPct', label: l('maxBackPct'), kind: 'number', value: set.maxBackPct, min: 0, max: 100, step: 5, unit: l('unitPct') },
                    {
                      name: 'waitForIndexing',
                      label: l('waitForIndexing'),
                      kind: 'select',
                      value: set.waitForIndexing ? 'on' : 'off',
                      options: [
                        { value: 'on', label: l('waitOn') },
                        { value: 'off', label: l('waitOff') },
                      ],
                    },
                    { name: 'minIndexedPct', label: l('minIndexedPct'), kind: 'number', value: set.minIndexedPct, min: 0, max: 100, step: 5, unit: l('unitPct') },
                    { name: 'bufferDays', label: l('bufferDays'), kind: 'number', value: set.bufferDays, min: 1, max: 30, step: 1, unit: l('unitDays') },
                    { name: 'stuckDays', label: l('stuckDays'), kind: 'number', value: set.stuckDays, min: 1, max: 60, step: 1, unit: l('unitDays') },
                    { name: 'refreshDays', label: l('refreshDays'), kind: 'number', value: set.refreshDays, min: 30, max: 1095, step: 30, unit: l('unitDays') },
                  ],
                },
              ]}
              testId="bp-card"
            />
          ) : (
            <p className="lm-card bp-ro" data-testid="bp-readonly">
              {l('readOnly')}
            </p>
          )}
          <section className="lm-card" aria-labelledby="bp-how-h">
            <h2 className="lm-h2" id="bp-how-h">
              {l('how')}
            </h2>
            <ol className="bp-how">
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
