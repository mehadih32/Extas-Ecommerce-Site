// S23 · PR 437, 438 (Blueprint C5.4 "a module of its own … all of its switches, schedules, spend and reports appear
// inside AI 360" — the AI 360 wiring itself is a later PR; this is the studio's own hub) — Marketing › Studio at
// /admin/marketing/studio: the social accounts (PR 437), the brand asset library and the templates (PR 438), and
// render jobs (PR 439: `queueSocialRender`/`runSocialRenderJob`, `@extas/studio`'s `render.ts`) — today's own
// preview step, honestly documented there. Seeing needs `studio.read`; adding, changing and archiving need
// `studio.write` (the API checks again, and archiving a brand asset also needs the Media library's own
// `media.manage`, @extas/studio's `assets.ts`); queueing/running a render job needs `studio.generate`. Nothing
// here posts to a real account or spends anything — that is PR 440–443.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { imageSources, mediaHttpStatus, MediaError, type ImageSource, type MediaDeps } from '@extas/media';
import {
  isStudioError,
  queueSocialRender,
  runSocialRenderJob,
  saveStudioAccount,
  saveStudioTemplate,
  setBrandAssetArchived,
  setBrandAssetKind,
  studioAccounts,
  studioBrandAssets,
  studioRenderJobs,
  studioTemplates,
  type SocialRenderJobRow,
  type StudioAccountRow,
  type StudioAssetRow,
  type StudioDeps,
  type StudioTemplateRow,
  type Who,
} from '@extas/studio';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { mediaDeps } from '../media';

const S = MOTHER_STORE_ID;

export interface StudioOverview {
  accounts: StudioAccountRow[];
  templates: StudioTemplateRow[];
  assets: StudioAssetRow[];
  renders: SocialRenderJobRow[];
  /** One `ImageSource` per asset that has a picture ready, for `<ResponsiveImage>` (the same the product gallery uses). */
  images: Record<string, ImageSource>;
  canWrite: boolean;
}

function studioDeps(deps: AdminDeps): StudioDeps {
  return { db: deps.db, settings: deps.resolver };
}

/** The whole page: accounts, templates, brand assets and render jobs, with a thumbnail for each image that has one. */
export async function studioOverview(deps: AdminDeps, who: Who): Promise<StudioOverview> {
  const sd = studioDeps(deps);
  const [{ rows: accounts, canWrite }, { rows: templates }, assets, renders] = await Promise.all([studioAccounts(sd, who), studioTemplates(sd, who), studioBrandAssets(sd, who), studioRenderJobs(sd, who)]);
  const imageIds = [...assets.filter((a) => a.mimeType.startsWith('image/')).map((a) => a.id), ...renders.flatMap((r) => (r.outputAssetId ? [r.outputAssetId] : []))];
  const images = imageIds.length ? Object.fromEntries(await imageSources({ db: deps.db, settings: deps.resolver }, who.storeId, imageIds)) : {};
  return { accounts, templates, assets, renders, images, canWrite };
}

const answer = (e: unknown): Response => {
  if (isStudioError(e)) return fail(e.status, e.code, e.details);
  if (e instanceof MediaError) return fail(mediaHttpStatus(e.code), e.code, e.details);
  return errorResponse(e);
};

/**
 * POST {action}: `account.*` (PR 437: add, rename, switch, requireApproval, dailyLimit, archive) ·
 * `template.*` (add, update, archive) · `asset.kind` {assetId, kind} · `asset.archive`/`asset.restore` {assetId,
 * archived, reason?} (every one of these needs `studio.write`) · `render.queue` {templateId, productIds, caption?}
 * and `render.run` {id} (PR 439, `studio.generate`). The asset and render actions re-check inside `@extas/studio`'s
 * own functions.
 */
async function studioAction(deps: AdminDeps, media: MediaDeps | null, who: Who, b: Record<string, unknown>): Promise<unknown> {
  const action = typeof b.action === 'string' ? b.action : '';
  const sd = studioDeps(deps);
  if (action.startsWith('account.')) return saveStudioAccount(sd, who, { ...b, action: action.slice('account.'.length) });
  if (action.startsWith('template.')) return saveStudioTemplate(sd, who, { ...b, action: action.slice('template.'.length) });
  if (action === 'asset.kind') return setBrandAssetKind(sd, who, { assetId: b.assetId, kind: b.kind });
  if (action === 'asset.archive' || action === 'asset.restore') {
    if (!media) return Promise.reject(new MediaError('INVALID_INPUT', 'media storage is not configured'));
    const assetId = typeof b.assetId === 'string' ? b.assetId : '';
    const reason = typeof b.reason === 'string' ? b.reason : undefined;
    return setBrandAssetArchived(sd, media, who, { assetId, archived: action === 'asset.archive', reason });
  }
  if (action === 'render.queue') return queueSocialRender(sd, who, { templateId: b.templateId, productIds: b.productIds, caption: b.caption });
  if (action === 'render.run') {
    const id = typeof b.id === 'string' ? b.id : '';
    return runSocialRenderJob(sd, who, id);
  }
  return Promise.reject(new MediaError('INVALID_INPUT', 'unknown action'));
}

/** `render.*` needs `studio.generate`; every other POST action needs `studio.write` (CLAUDE.md rule 6: nobody who can only generate a draft can also touch accounts or templates). */
const postPermission = (action: unknown): 'studio.generate' | 'studio.write' => (typeof action === 'string' && action.startsWith('render.') ? 'studio.generate' : 'studio.write');

/**
 * /api/admin/marketing/studio — GET the page (`studio.read`); POST an account/template/asset action (`studio.write`)
 * or a render job action (`studio.generate`). `media` is the real process-wide Media deps by default (the route
 * omits it); tests pass their own, pointed at the throwaway database, the same way `support-api.ts`'s file actions do.
 */
export async function studioHandler(request: Request, deps: AdminDeps | null, media?: MediaDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'studio.read' : postPermission(b.action), storeId: S });
  if (g instanceof Response) return g;
  const who: Who = { actor: g.actor, storeId: S, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await studioOverview(deps!, who)) });
    const m = media === undefined ? mediaDeps() : media;
    return json({ ok: true, ...((await studioAction(deps!, m, who, b)) as object) });
  } catch (e) {
    return answer(e);
  }
}
