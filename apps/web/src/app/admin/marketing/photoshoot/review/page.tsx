// S24 · PR 458 (Blueprint C7.5 step 10 "human review queue", C7.16 "Review and approval UI — side by side, with
// reasons on rejection") — Marketing › Photoshoot review queue at /admin/marketing/photoshoot/review: every job
// waiting on the owner's own decision, oldest-waiting first, each with its product name and the generated
// candidate's own thumbnail. Opening one goes to the side-by-side decision page at
// /admin/marketing/photoshoot/review/<jobId>. Seeing this list needs `photoshoot.read`. Hidden from the menu by
// `stages.closedShown.S24` until the whole stage is finished and gated (PR 652's mechanism, the same as PR 437's
// own Studio page and PR 457's editor) — but this address works once you have it.
// lib/marketing/photoshootReview.ts. Guide: docs/admin-guide/pages/marketing/photoshoot-reviews.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { loadReviewQueueView, previewUrl } from '@/lib/marketing/photoshootReview';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-marketing-photoshoot-review.bn.json';
import en from '../../../../../../messages/admin-marketing-photoshoot-review.en.json';
import '../../../settings-cards.css';
import '../../ad-platforms/ad-platforms.css';
import '../photoshoot.css';

export const dynamic = 'force-dynamic';

const KEY = 'marketingPhotoshootReview';
const HERE = '/admin/marketing/photoshoot/review';

function withScreen<T extends { lang: 'bn' | 'en'; dict: Dict }>(view: T): T {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'photoshootReview.list.metaTitle'), robots: { index: false, follow: false } };
}

export default async function PhotoshootReviewPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('photoshoot.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="photoshoot-review-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="photoshoot.read" />
      </div>
    );
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const { items } = await loadReviewQueueView(access.deps, who);
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `photoshootReview.list.${k}`, vars);
  const productName = (p: { nameEn: string; nameBn: string | null } | null) => (p ? (view.lang === 'bn' && p.nameBn) || p.nameEn : g('unknownProduct'));

  return (
    <div className="a2-z" data-testid="photoshoot-review-page" data-lm-ready="">
      <div className="a2-sc">
        <h1 className="a2-h3">{g('title')}</h1>
        <p className="a2-sm a2-mute">{g('sub')}</p>
      </div>

      {items.length ? (
        <ul className="adp-rules yt-mt8" data-testid="prv-queue">
          {items.map(({ job, product, thumbnail }) => {
            const url = previewUrl(thumbnail);
            return (
              <li key={job.id} className="adp-rule ped-review-row" data-testid="prv-row">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a plain admin-only list thumbnail
                  <img src={url} alt="" className="ped-review-thumb" />
                ) : (
                  <span className="ped-review-thumb ped-review-thumb-empty" aria-hidden="true" />
                )}
                <span className="ped-review-row-text">
                  <p className="a2-sm adp-sub">{productName(product)}</p>
                  <p className="a2-xs a2-mute">{g('waitingSince', { when: new Date(job.createdAt).toLocaleString(view.locale) })}</p>
                </span>
                <Link className="a2-btn" href={`${HERE}/${job.id}`} data-testid="prv-open">
                  {g('open')}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="a2-sm a2-mute yt-mt8" data-testid="prv-empty">
          {g('empty')}
        </p>
      )}
    </div>
  );
}
