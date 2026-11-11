// S25 · PR 482 — Marketing › Studio › Videos at /admin/marketing/studio/videos: a product picker (only products with
// a live primary photo appear — Blueprint C8.1: the clip's first frame is always an already-approved still) and the
// image-to-video job list. GET lists jobs and, once `studio.video.enabled` is on, the pickable products
// (`marketing.studio.read`); POST {action: 'estimate' | 'request', input} prices or requests a clip
// (`marketing.studio.write`). Nothing here runs a job (PR 483) or approves one (PR 484).
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { Actor, RequestContext } from '@extas/auth';
import { createConnections, videoProviderAdapters, type VideoProvider } from '@extas/adapters';
import { estimateVideoJob, listVideoJobs, requestVideoJob, StudioError, type StudioDeps, type VideoJobView } from '@extas/creative-studio';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export interface VideosOverview {
  jobs: VideoJobView[];
  videoEnabled: boolean;
  products: { id: string; name: string }[];
}

/** The honest-preview mock until a real video provider is connected (Blueprint C7.17). */
async function videoProvider(deps: AdminDeps): Promise<VideoProvider> {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: videoProviderAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  const link = await c.use<VideoProvider>('AI_PROVIDER', { storeId: S, provider: 'mockVideoProvider' });
  return link.api;
}

async function pickableProducts(deps: AdminDeps): Promise<{ id: string; name: string }[]> {
  const rows = await deps.db.product.findMany({
    where: { storeId: S, media: { some: { archivedAt: null, isPrimary: true, asset: { kind: 'IMAGE', archivedAt: null } } } },
    select: { id: true, nameEn: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  return rows.map((p) => ({ id: p.id, name: p.nameEn }));
}

export async function videosOverview(deps: AdminDeps, sd: StudioDeps): Promise<VideosOverview> {
  const [jobs, video, products] = await Promise.all([listVideoJobs(sd, S), deps.resolver.value('studio.video', { storeId: S }), pickableProducts(deps)]);
  return { jobs, videoEnabled: video.enabled, products };
}

/**
 * /api/admin/marketing/studio/videos — GET the overview (`marketing.studio.read`); POST {action: 'estimate' |
 * 'request', input} (`marketing.studio.write`).
 */
export async function videosHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.studio.read' : 'marketing.studio.write';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const sd: StudioDeps = { db: deps!.db, settings: deps!.resolver };
  const who = { actor: g.actor as Actor, storeId: S, ctx: g.ctx as RequestContext };
  try {
    if (method === 'GET') return json({ ok: true, ...(await videosOverview(deps!, sd)) });
    const provider = await videoProvider(deps!);
    if (b.action === 'estimate') return json({ ok: true, estimate: await estimateVideoJob(sd, provider, S, b.input) });
    if (b.action === 'request') return json({ ok: true, job: await requestVideoJob(sd, who, provider, b.input) });
    throw new StudioError('INVALID_INPUT', 'unknown action', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
