// S05 · PR 148, 149 — the Messages admin API (MSG-01, the order journey). Every route signs the person in (guardAdmin),
// checks the permission in the store it touches (`?storeId=`, default the mother store), then calls @extas/messages,
// which checks the permission again and writes the audit log. Answers are `{ ok: true, … }` or
// `{ ok: false, error: CODE, details }`. One catch-all route (app/api/admin/messages/[[...path]]) hands every path to
// `messagesRoute`.
//
//   GET   /api/admin/messages/journey        the journey: steps, channels (live or mock), caps, quiet hours, self-confirm,
//                                            the templates each step has, and the version to send back
//   PUT   /api/admin/messages/journey        {version?, enabled?, journey?, caps?, selfConfirm?, quietHours?, language?,
//                                            amountLine?, exactAmount?, cancelNotice? (PR 546)} save (STALE when someone
//                                            saved in between)
//   POST  /api/admin/messages/self-confirm   {orderNumber, answer: 1 | 2 | 3} the customer's reply, recorded by staff
//                                            (until the WhatsApp provider's replies arrive by themselves)
//   GET   /api/admin/messages/log            PR 149: the log, newest first (?status, ?channel, ?step, ?orderNumber, ?from,
//                                            ?to, ?cursor, ?limit) with the counts per state
//   GET   /api/admin/messages/log/:id        one message with every try
//   POST  /api/admin/messages/log/:id/retry  a FAILED message tried once more, now
//   GET   /api/admin/messages/channels       PR 291: Channels & limits — each channel's provider, mode and credit, its 7
//                                            days, the master switch, caps, quiet hours, SMS masking name and part prices
//   PUT   /api/admin/messages/channels       {version?, enabled?, caps?, quietHours?, masking?, smsRates?} (STALE when
//                                            someone saved in between)
//   GET   /api/admin/messages/whatsapp/templates               PR 292: the WhatsApp templates with Meta's word on each
//   POST  /api/admin/messages/whatsapp/templates/sync          read Meta's word on every template again
//   POST  /api/admin/messages/whatsapp/templates/:id/submit    send one for Meta's approval (sample values as examples)
//   GET   /api/admin/messages/consent          PR 298: the stop words, the last 30 days, the newest answers (?phone: one
//                                            number's answers per channel)
//   PUT   /api/admin/messages/consent          {version?, consent} the stop words and their rules (STALE in between)
//   POST  /api/admin/messages/consent/record   {phone, channels, action: stopAll | allowAll | stopOffers | allowOffers}
//                                            a customer's stop or start, recorded at his request
//   GET   /api/admin/messages/templates    PR 505: every template grouped by key, where each is used, the missing
//                                            languages, the problems, the sample previews, the auto-reply
//   POST  /api/admin/messages/templates    {key, channel, locale, body, subject?} a missing one added
//   PUT   /api/admin/messages/templates/auto-reply   {version?, autoReply} the auto-reply's settings (STALE in between)
//   PUT   /api/admin/messages/templates/:id          {version, body, subject?} its words (STALE in between)
//   POST  /api/admin/messages/templates/:id/reset    {version} its default words back
// The WhatsApp provider's own webhook is not here: app/api/whatsapp/webhook (signed, no session).
import { createConnections, messageAdapters } from '@extas/adapters';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as ms from '@extas/messages';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';

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

/** A screen's version as sent back with a save (absent: no check). */
function versionOf(version: unknown): string | undefined {
  if (version !== undefined && typeof version !== 'string') throw new ms.MessagesError('INVALID_INPUT', 'the version is not valid', ['version']);
  return version;
}

/** Every Messages route: `path` is what comes after /api/admin/messages. */
export async function messagesRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b, c] = path;
  if (a === 'log') {
    if (path.length > 3) return fail(404, 'not-found');
    if (b === undefined) {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'messages.log.view', async (x) => {
        const url = new URL(request.url);
        const q = Object.fromEntries(['status', 'channel', 'step', 'orderNumber', 'from', 'to', 'cursor', 'limit'].flatMap((k) => (url.searchParams.has(k) ? [[k, url.searchParams.get(k)!]] : [])));
        return { log: await ms.messageLog(x.deps, x.who, q) };
      });
    }
    if (!isUuid(b)) return fail(400, 'INVALID_INPUT', ['id']);
    if (c === undefined) return m === 'GET' ? handle(request, deps, 'messages.log.view', async (x) => ({ message: await ms.messageDetail(x.deps, x.who, b) })) : notAllowed();
    if (c === 'retry') return m === 'POST' ? handle(request, deps, 'messages.log.retry', async (x) => ({ retry: await ms.retryMessage(x.deps, x.who, b) })) : notAllowed();
    return fail(404, 'not-found');
  }
  if (a === 'whatsapp' && b === 'templates') {
    // PR 292: the WhatsApp templates with the provider's word on each, read again, or one sent for approval
    if (c === undefined) return m === 'GET' ? handle(request, deps, 'messages.channels.read', async (x) => ({ templates: await ms.waTemplatesScreen(x.deps, x.who) })) : notAllowed();
    if (path.length === 3 && c === 'sync') return m === 'POST' ? handle(request, deps, 'messages.channels.write', async (x) => ({ sync: await ms.syncWaTemplates(x.deps, x.who) })) : notAllowed();
    if (path.length === 4 && path[3] === 'submit') {
      if (!isUuid(c)) return fail(400, 'INVALID_INPUT', ['id']);
      return m === 'POST' ? handle(request, deps, 'messages.channels.write', async (x) => ({ submit: await ms.submitWaTemplate(x.deps, x.who, c) })) : notAllowed();
    }
    return fail(404, 'not-found');
  }
  if (a === 'consent') {
    // PR 298: who stopped which messages, one number's answers, the stop words; a stop or start at his request
    if (path.length > 2) return fail(404, 'not-found');
    if (b === 'record') return m === 'POST' ? handle(request, deps, 'messages.consent.write', async (x) => ({ record: await ms.recordConsentByStaff(x.deps, x.who, await body(request)) })) : notAllowed();
    if (b !== undefined) return fail(404, 'not-found');
    if (m === 'GET') return handle(request, deps, 'messages.consent.view', async (x) => ({ consent: await ms.consentScreen(x.deps, x.who, { phone: new URL(request.url).searchParams.get('phone') }) }));
    if (m === 'PUT')
      return handle(request, deps, 'messages.consent.write', async (x) => {
        const { version, ...input } = await body(request);
        return { consent: await ms.saveConsentSettings(x.deps, x.who, input, versionOf(version)) };
      });
    return notAllowed();
  }
  if (a === 'templates') {
    // PR 505: the template editor and the auto-reply
    if (path.length > 3) return fail(404, 'not-found');
    if (b === undefined) {
      if (m === 'GET') return handle(request, deps, 'messages.templates.read', async (x) => ({ templates: await ms.templatesScreen(x.deps, x.who) }));
      if (m === 'POST') return handle(request, deps, 'messages.templates.write', async (x) => ({ templates: await ms.createTemplate(x.deps, x.who, await body(request)) }));
      return notAllowed();
    }
    if (b === 'auto-reply' && c === undefined)
      return m === 'PUT'
        ? handle(request, deps, 'messages.templates.write', async (x) => {
            const { version, ...input } = await body(request);
            return { templates: await ms.saveAutoReply(x.deps, x.who, input, versionOf(version)) };
          })
        : notAllowed();
    if (!isUuid(b)) return fail(400, 'INVALID_INPUT', ['id']);
    if (c === undefined) return m === 'PUT' ? handle(request, deps, 'messages.templates.write', async (x) => ({ templates: await ms.saveTemplate(x.deps, x.who, b, await body(request)) })) : notAllowed();
    if (c === 'reset') return m === 'POST' ? handle(request, deps, 'messages.templates.write', async (x) => ({ templates: await ms.resetTemplate(x.deps, x.who, b, await body(request)) })) : notAllowed();
    return fail(404, 'not-found');
  }
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
  if (a === 'channels') {
    if (m === 'GET') return handle(request, deps, 'messages.channels.read', async (x) => ({ channels: await ms.channelsScreen(x.deps, x.who) }));
    if (m === 'PUT')
      return handle(request, deps, 'messages.channels.write', async (x) => {
        const { version, ...input } = await body(request);
        return { channels: await ms.saveChannels(x.deps, x.who, input, versionOf(version)) };
      });
    return notAllowed();
  }
  return fail(404, 'not-found');
}
