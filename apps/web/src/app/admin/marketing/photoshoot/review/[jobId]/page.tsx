// S24 · PR 458 (Blueprint C7.5 step 10 "the owner sees generated vs original side by side and approves, rejects
// or regenerates", C7.16 "Review and approval UI — side by side, with reasons on rejection") — Marketing ›
// Photoshoot review decision page at /admin/marketing/photoshoot/review/[jobId]. Seeing it needs
// `photoshoot.read`; deciding needs `photoshoot.approve` (the API re-checks). Hidden from the menu by
// `stages.closedShown.S24` until the whole stage is finished and gated (PR 652's mechanism, the same as PR 437's
// own Studio page and PR 457's editor) — but this address works once you have it.
// lib/marketing/photoshootReview.ts. Guide: docs/admin-guide/pages/marketing/photoshoot-review.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PhotoshootReviewForm } from '@/components/admin/marketing/PhotoshootReviewForm';
import { ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { loadReviewDetailView, previewUrl } from '@/lib/marketing/photoshootReview';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../../messages/admin-marketing-photoshoot-review.bn.json';
import en from '../../../../../../../messages/admin-marketing-photoshoot-review.en.json';
import '../../../../settings-cards.css';
import '../../../ad-platforms/ad-platforms.css';
import '../../photoshoot.css';

export const dynamic = 'force-dynamic';

const KEY = 'marketingPhotoshootReview';
const QUEUE = '/admin/marketing/photoshoot/review';
const here = (jobId: string) => `${QUEUE}/${jobId}`;

type Params = Promise<{ jobId: string }>;

function withScreen<T extends { lang: 'bn' | 'en'; dict: Dict }>(view: T): T {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  void (await params);
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'photoshootReview.detail.metaTitle'), robots: { index: false, follow: false } };
}

export default async function PhotoshootReviewDetailPage({ params }: { params: Params }) {
  const { jobId } = await params;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('photoshoot.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here(jobId))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="photoshoot-review-detail-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="photoshoot.read" />
      </div>
    );
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const v = await loadReviewDetailView(access.deps, who, jobId);
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `photoshootReview.detail.${k}`, vars);
  if (!v.job)
    return (
      <div className="a2-z" data-testid="photoshoot-review-detail-page" data-lm-ready="">
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const canDecide = access.guard.permissions?.has('photoshoot.approve') ?? false;
  const productName = v.product ? (view.lang === 'bn' && v.product.nameBn) || v.product.nameEn : g('unknownProduct');
  const originalUrl = previewUrl(v.originalImage);
  const generatedUrl = previewUrl(v.generatedImage);
  const texts = {
    err: Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, g(`err.${k}`)])),
    original: g('original'),
    generated: g('generated'),
    noPicture: g('noPicture'),
    reasonLabel: g('reasonLabel'),
    reasonHelp: g('reasonHelp'),
    reasonRequired: g('reasonRequired'),
    approve: g('approve'),
    reject: g('reject'),
    deciding: g('deciding'),
    approved: g('approved'),
    rejected: g('rejected'),
  };

  return (
    <div className="a2-z" data-testid="photoshoot-review-detail-page" data-lm-ready="">
      <div className="a2-sc">
        <h1 className="a2-h3">{g('title')}</h1>
        <p className="a2-sm a2-mute">{productName}</p>
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="prv-cmp-h" data-testid="prv-compare">
        <h2 className="a2-h3" id="prv-cmp-h">
          {g('sub')}
        </h2>
        <div className="ped-review-grid">
          <div className="ped-review-col">
            <p className="a2-sm adp-sub">{g('original')}</p>
            {originalUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a plain side-by-side comparison image
              <img src={originalUrl} alt="" className="ped-img" data-testid="prv-original-img" />
            ) : (
              <p className="a2-sm a2-mute">{g('noPicture')}</p>
            )}
          </div>
          <div className="ped-review-col">
            <p className="a2-sm adp-sub">{g('generated')}</p>
            {generatedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a plain side-by-side comparison image
              <img src={generatedUrl} alt="" className="ped-img" data-testid="prv-generated-img" />
            ) : (
              <p className="a2-sm a2-mute">{g('noPicture')}</p>
            )}
          </div>
        </div>
      </section>

      {v.output ? (
        canDecide ? (
          <PhotoshootReviewForm outputId={v.output.id} texts={texts} />
        ) : (
          <p className="a2-sm a2-mute yt-mt8" data-testid="prv-readonly">
            {g('readOnly')}
          </p>
        )
      ) : (
        <p className="a2-sm a2-mute yt-mt8" data-testid="prv-decided">
          {g('alreadyDecided')}
        </p>
      )}

      <p className="a2-mt12">
        <Link className="a2-btn" href={QUEUE} data-testid="prv-back">
          {g('back')}
        </Link>
      </p>
    </div>
  );
}
