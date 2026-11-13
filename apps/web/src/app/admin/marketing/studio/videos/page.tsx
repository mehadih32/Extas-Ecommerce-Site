// S25 · PR 482 (Blueprint C8.1, C8.2) — Marketing › Studio › Videos at /admin/marketing/studio/videos, on
// /api/admin/marketing/studio/videos (lib/studio/video-admin.ts). Seeing needs `marketing.studio.read`; pricing and
// requesting a clip needs `marketing.studio.write`. The whole Studio tab stays hidden by `stages.closedShown.S25`
// until the stage is finished (CN-036/CN-039). Guide: docs/admin-guide/pages/marketing/studio-videos.md.
// S25 · PR 483 — each job row also carries its own next move (queue/run/retry, `VideoJobActions`).
// S25 · PR 484 — a job on REVIEW_REQUIRED gets its own Approve / Reject there too, and a run's real cost
// (`actualMinor`, already doubled when `studio.video.bestOfTwo` is on) shows once it has one.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { VIDEO_ASPECTS, type VideoAspect } from '@extas/adapters';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { VideoJobActions, VideoRequestForm, type VideoTexts } from '@/components/admin/studio/VideoJobs';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { videosOverview } from '@/lib/studio/video-admin';
import bn from '../../../../../../messages/admin-marketing-studio.bn.json';
import en from '../../../../../../messages/admin-marketing-studio.en.json';
import '../../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/studio/videos';
const API = '/api/admin/marketing/studio/videos';
const KEY = 'marketingStudioVideos';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'studio.videos.metaTitle'), robots: { index: false, follow: false } };
}

export default async function VideoJobsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.studio.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="video-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.studio.read" />
      </div>
    );
  const g = (k: string) => t(d, `studio.videos.${k}`);
  const canWrite = access.guard.permissions?.has('marketing.studio.write') ?? false;
  const errs = Object.fromEntries(['INVALID_INPUT', 'OFF', 'SOURCE_INVALID', 'WRONG_STATE', 'CAP_REACHED', 'NOT_FOUND', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const aspectName = Object.fromEntries(VIDEO_ASPECTS.map((a) => [a, g(`aspect.${a.replace(':', '')}`)])) as Record<VideoAspect, string>;
  const [currency, { jobs, videoEnabled, products }] = await Promise.all([access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }), videosOverview(access.deps, { db: access.deps.db, settings: access.deps.resolver })]);
  const money = moneyOf(currency, view.locale);
  const texts: VideoTexts = {
    product: g('product'),
    aspect: g('aspect'),
    aspectName,
    duration: g('duration'),
    priceIt: g('priceIt'),
    pricing: g('pricing'),
    requestIt: g('requestIt'),
    requesting: g('requesting'),
    requested: g('requested'),
    costUnset: g('costUnset'),
    queueIt: g('queueIt'),
    queuing: g('queuing'),
    runIt: g('runIt'),
    running: g('running'),
    retryIt: g('retryIt'),
    retrying: g('retrying'),
    attemptOf: g('attemptOf'),
    approveIt: g('approveIt'),
    approving: g('approving'),
    rejectIt: g('rejectIt'),
    rejecting: g('rejecting'),
    awaitingReview: g('awaitingReview'),
    money,
    noProducts: g('noProducts'),
    err: errs,
  };
  const statusWord = (s: string) => g(`status.${s}`) || s;
  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? id ?? '—';

  return (
    <div className="a2-z" data-testid="video-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />

      {!videoEnabled ? (
        <p className="a2-sm a2-mute" data-testid="video-off-notice">
          {g('offNotice')}
        </p>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="video-list-h" data-testid="video-list">
        <h2 className="a2-h3" id="video-list-h">
          {g('listH')}
        </h2>
        {jobs.length ? (
          <ul className="adp-rules">
            {jobs.map((j) => (
              <li key={j.id} className="adp-rule" data-testid="video-row" data-status={j.status}>
                <p className="a2-sm adp-sub">
                  {productName(j.productId)} <span className="a2-pill info">{j.aspect ?? '—'}</span>
                  <span className="a2-pill">{statusWord(j.status)}</span>
                </p>
                <p className="a2-sm a2-mute">
                  {j.durationSec ?? '—'}s · {j.estimateMinor == null ? g('costUnset') : formatMoney(j.estimateMinor, money)}
                  {j.actualMinor != null ? ` · ${g('actualCost')}: ${formatMoney(j.actualMinor, money)}` : ''}
                </p>
                {canWrite ? <VideoJobActions url={API} jobId={j.id} status={j.status} attempt={j.attempt} texts={texts} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{g('empty')}</p>
        )}
      </section>

      {canWrite ? (
        <section className="a2-sc a2-mt12" aria-labelledby="video-new-h" data-testid="video-new-section">
          <h2 className="a2-h3" id="video-new-h">
            {g('newH')}
          </h2>
          <p className="a2-sm a2-mute">{videoEnabled ? g('newD') : g('newDOff')}</p>
          {videoEnabled ? <VideoRequestForm url={API} products={products} texts={texts} /> : null}
        </section>
      ) : null}
    </div>
  );
}
