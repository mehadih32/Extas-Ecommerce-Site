// S25 · PR 485 (Blueprint C8.1, C8.6 item 5) — Marketing › Studio › Reels at /admin/marketing/studio/reels, on
// /api/admin/marketing/studio/reels (lib/studio/reel-admin.ts). Seeing needs `marketing.studio.read`; building a
// reel or setting one aside needs `marketing.studio.write`. The whole Studio tab stays hidden by
// `stages.closedShown.S25` until the stage is finished (CN-036/CN-039). Guide:
// docs/admin-guide/pages/marketing/studio-reels.md. Assembling a built reel (the honest-preview compositor, one
// output per chosen shape) is PR 486.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { VIDEO_ASPECTS, type VideoAspect } from '@extas/adapters/video';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ReelArchive, ReelBuilder, type ReelTexts } from '@/components/admin/studio/ReelBuilder';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { reelsOverview } from '@/lib/studio/reel-admin';
import bn from '../../../../../../messages/admin-marketing-studio.bn.json';
import en from '../../../../../../messages/admin-marketing-studio.en.json';
import '../../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/studio/reels';
const API = '/api/admin/marketing/studio/reels';
const KEY = 'marketingStudioReels';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'studio.reels.metaTitle'), robots: { index: false, follow: false } };
}

export default async function ReelsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.studio.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="reel-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.studio.read" />
      </div>
    );
  const g = (k: string) => t(d, `studio.reels.${k}`);
  const canWrite = access.guard.permissions?.has('marketing.studio.write') ?? false;
  const errs = Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'CLIPS_NOT_READY', 'SOURCE_INVALID', 'WRONG_STATE', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const aspectName = Object.fromEntries(VIDEO_ASPECTS.map((a) => [a, g(`aspect.${a.replace(':', '')}`)])) as Record<VideoAspect, string>;
  const { reels, approvedClips } = await reelsOverview(access.deps, { db: access.deps.db });
  const texts: ReelTexts = {
    title: g('formTitle'),
    clips: g('clips'),
    noApprovedClips: g('noApprovedClips'),
    shapes: g('shapes'),
    aspectName,
    music: g('music'),
    musicPh: g('musicPh'),
    musicHelp: g('musicHelp'),
    overlayText: g('overlayText'),
    overlayTextPh: g('overlayTextPh'),
    showLogo: g('showLogo'),
    build: g('build'),
    building: g('building'),
    built: g('built'),
    archive: g('archive'),
    archiving: g('archiving'),
    restore: g('restore'),
    restoring: g('restoring'),
    err: errs,
  };
  const statusWord = (s: string) => g(`status.${s}`) || s;

  return (
    <div className="a2-z" data-testid="reel-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-sc a2-mt12" aria-labelledby="reel-list-h" data-testid="reel-list">
        <h2 className="a2-h3" id="reel-list-h">
          {g('listH')}
        </h2>
        {reels.length ? (
          <ul className="adp-rules">
            {reels.map((r) => (
              <li key={r.id} className="adp-rule" data-testid="reel-row" data-status={r.status}>
                <p className="a2-sm adp-sub">
                  {r.title} <span className="a2-pill">{statusWord(r.status)}</span>
                  {r.musicAssetId ? <span className="a2-pill info">{g('hasMusic')}</span> : null}
                </p>
                <p className="a2-sm a2-mute">
                  {r.clipJobIds.length} {g('clipsCount')} · {r.aspects.map((a) => aspectName[a]).join(', ')}
                </p>
                {canWrite && r.status === 'DRAFT' ? <ReelArchive url={API} reelId={r.id} texts={texts} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{g('empty')}</p>
        )}
      </section>

      {canWrite ? (
        <section className="a2-sc a2-mt12" aria-labelledby="reel-new-h" data-testid="reel-new-section">
          <h2 className="a2-h3" id="reel-new-h">
            {g('newH')}
          </h2>
          <p className="a2-sm a2-mute">{g('newD')}</p>
          <ReelBuilder url={API} approvedClips={approvedClips} texts={texts} />
        </section>
      ) : null}
    </div>
  );
}
