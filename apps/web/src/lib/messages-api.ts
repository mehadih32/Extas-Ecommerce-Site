// S05 · PR 148 — the Messages admin API (MSG-01, the order journey). Every route signs the person in (guardAdmin),
// checks the permission in the store it touches (`?storeId=`, default the mother store), then calls @extas/messages,
// which checks the permission again and writes the audit log. Answers are `{ ok: true, … }` or
// `{ ok: false, error: CODE, details }`. One catch-all route (app/api/admin/messages/[[...path]]) hands every path to
// `messagesRoute`.
//
//   GET   /api/admin/messages/journey        the journey: steps, channels (live or mock), caps, quiet hours, self-confirm,
//                                            the templates each step has, and the version to send back
//   PUT   /api/admin/messages/journey        {version?, enabled?, journey?, caps?, selfConfirm?, quietHours?, language?,
//                                            amountLine?, exactAmount?} save (STALE when someone saved in between)
//   POST  /api/admin/messages/self-confirm   {orderNumber, answer: 1 | 2 | 3} the customer's reply, recorded by staff
//                                            (until the WhatsApp provider's replies arrive by themselves)
import { createConnections, messageAdapters } from '@extas/adapters';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as ms from '@extas/messages';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

interface Ctx {
  deps: ms.MessagesDeps & { settings: AdminDeps['resolver'] };
  who: ms.Who;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The engine's dependencies in the app: the senders through the connection layer (each the mock until its key). */
export async function messagesDeps(deps: AdminDeps): Promise<Ctx['deps']> {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const connections = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: messageAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  return { db: deps.db, settings: deps.resolver, sender: ms.sendersFrom(connections), now: deps.now };
}

async function handle(request: Request, deps: AdminDeps | null, permission: ms.MessagesPermission, fn: (c: Ctx) => Promise<Record<string, unknown>>): Promise<Response> {
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    return json({ ok: true, ...(await fn({ deps: await messagesDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx } })) });
  } catch (e) {
    return ms.isMessagesError(e) ? fail(e.status, e.code, e.details) : errorResponse(e);
  }
}

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));

/** Every Messages route: `path` is what comes after /api/admin/messages. */
export async function messagesRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b] = path;
  if (b !== undefined) return fail(404, 'not-found');
  if (a === 'journey') {
    if (m === 'GET') return handle(request, deps, 'messages.journey.read', async (x) => ({ journey: await ms.journeyScreen(x.deps, x.who) }));
    if (m === 'PUT')
      return handle(request, deps, 'messages.journey.write', async (x) => {
        const { version, ...input } = await body(request);
        if (version !== undefined && typeof version !== 'string') throw new ms.MessagesError('INVALID_INPUT', 'the version is not valid', ['version']);
        return { journey: await ms.saveJourney(x.deps, x.who, input, version) };
      });
    return notAllowed();
  }
  if (a === 'self-confirm') return m === 'POST' ? handle(request, deps, 'messages.selfConfirm.reply', async (x) => ({ reply: await ms.recordSelfConfirmReply(x.deps, x.who, await body(request)) })) : notAllowed();
  return fail(404, 'not-found');
}
