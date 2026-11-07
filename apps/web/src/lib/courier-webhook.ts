// Follow-up 372 — POST /api/courier/<courier>/webhook, the route's own half (app/api/courier/[provider]/webhook): every
// check, setting and answer is in @extas/shipping webhooks.ts (`receiveCourierWebhook`). No session and no cookie: the
// call proves itself with the token (Steadfast) or secret (Pathao) the owner typed into that courier's Keys &
// connections row, and the site's password gate lets these two POST paths through (infra/stack/caddy/auth-block.sh).
// - Off (`delivery.courier.webhooks`, as shipped) or not a courier that calls: 404, the body never read.
// - The body is read as a stream and stopped at the setting's size (a chunked body has no Content-Length): 413.
// - Every refusal of the caller is one 401 with one code; what the call did stays on the shop (WebhookEvent).
// - Steadfast is answered 200, Pathao 202 (each courier's own expectation), with Pathao's set-up reply header.
import { courierAdapters, courierWebhookOf, createConnections, type Connections } from '@extas/adapters';
import { courierWebhookMaxBytes, receiveCourierWebhook, type CourierWebhookAnswer, type CourierWebhookDeps } from '@extas/shipping';
import { adminDeps, type AdminDeps } from './admin-auth';
import { readCapped } from './erp-webhook';

const holder = globalThis as unknown as { __courierWebhookConnections?: { connections: Connections; at: number; ttlMs: number } };

/** The app's own deps: one connection layer for this process, so a key is read from the vault once per cache period. */
export async function courierWebhookDeps(deps: AdminDeps): Promise<CourierWebhookDeps> {
  const now = Date.now();
  let hit = holder.__courierWebhookConnections;
  if (!hit || now - hit.at >= hit.ttlMs) {
    const [testSeconds, cacheSeconds] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
    const connections = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: courierAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
    hit = holder.__courierWebhookConnections = { connections, at: now, ttlMs: cacheSeconds * 1000 };
  }
  return { db: deps.db, settings: deps.resolver, connections: hit.connections, now: deps.now };
}

const answer = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });

/** What the courier sees: every refusal of the caller the same; the courier's own reply header when it has one. */
export const courierAnswer = (r: Pick<CourierWebhookAnswer, 'status' | 'code' | 'headers'>): Response =>
  r.status === 401 ? answer(401, { ok: false, code: 'UNAUTHORIZED' }) : answer(r.status, { ok: r.status < 300, code: r.code }, r.headers);

export interface CourierWebhookRouteOptions {
  /** The app's deps (a test gives its own). */
  deps?: () => AdminDeps | null;
  build?: (deps: AdminDeps) => Promise<CourierWebhookDeps>;
}

/** The whole route for one courier. */
export async function courierWebhookRoute(request: Request, provider: string, opts: CourierWebhookRouteOptions = {}): Promise<Response> {
  if (!courierWebhookOf(provider)) return answer(404, { ok: false, code: 'NOT_FOUND' });
  const app = (opts.deps ?? adminDeps)();
  if (!app) return answer(503, { ok: false, code: 'UNAVAILABLE' });
  try {
    const deps = await (opts.build ?? courierWebhookDeps)(app);
    const maxBytes = await courierWebhookMaxBytes(deps);
    if (maxBytes === null) return answer(404, { ok: false, code: 'NOT_FOUND' });
    const length = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > maxBytes) return answer(413, { ok: false, code: 'TOO_LARGE' });
    const rawBody = await readCapped(request, maxBytes);
    if (rawBody === null) return answer(413, { ok: false, code: 'TOO_LARGE' });
    return courierAnswer(await receiveCourierWebhook(deps, provider, { rawBody, headers: request.headers }));
  } catch (e) {
    console.error(`[courier webhook] ${provider}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return answer(500, { ok: false, code: 'SERVER_ERROR' });
  }
}
