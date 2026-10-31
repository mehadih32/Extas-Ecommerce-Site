// S14 · PR 292 — the WhatsApp Business Platform (MSG-05; BACKEND-ARCHITECTURE §5.7, §8.8). The adapter is
// @extas/adapters `whatsappCloud` (Meta's Cloud API): its keys (access token, app secret, verify token) are typed in on
// Keys & connections and live in the vault; until then the practice sender answers and nothing leaves the server.
//
// - Templates: a message the shop starts goes only as a template Meta approved (the engine checks it before every live
//   send). The channels screen lists the shop's WhatsApp templates with Meta's word on each, reads it again ("Sync")
//   and sends one for approval ("Send for approval": its body with {{1}}, {{2}} … and the sample order's values as the
//   examples). Seeing needs `messages.channels.read`, the two actions `messages.channels.write`; each is audited.
// - The webhook (web route /api/whatsapp/webhook): Meta's GET handshake answers the challenge when the verify token
//   matches; a POST proves itself with its signature (X-Hub-Signature-256, HMAC-SHA256 of the raw body with the app
//   secret). **No secret in the vault → every POST is refused.** A verified POST carries:
//   - receipts (sent, delivered, read, failed) for messages the shop sent, found by the provider's message id:
//     delivered and read mark the log row DELIVERED (never back down again); failed closes a row not delivered yet as
//     FAILED (UNREACHABLE when the number is not on WhatsApp) and tries the step's fallback channel;
//   - the customer's replies: a "1", "2" or "3" (Bengali digits too) to the self-confirm question asked within
//     `messages.whatsapp.replyWindowHours` is recorded as his answer (`selfConfirmReply`, as if staff had typed it).
//     Anything else is left for the consent words (PR 298) and the team; PR 505: with `messages.autoReply` on, it is
//     answered once per window with the auto-reply template (never to a number that stopped messages).
// Nothing here moves money, changes a price or sends to a real number on its own.
import { timingSafeEqual, createHash } from 'node:crypto';
import { parseWhatsAppWebhook, verifyWhatsAppSignature, WHATSAPP_CLOUD_PROVIDER, type Connections, type WhatsAppInbound, type WhatsAppReceipt } from '@extas/adapters';
import { MOTHER_STORE_ID, type Prisma } from '@extas/db/client';
import { systemBy } from '@extas/orders';
import { allow, holds, logChange, MessagesError, nowOf, setting, type MessagesDeps, type Sender, type Who } from './context';
import { consentBlock, consentReply, customerOf } from './consent';
import { AUTO_REPLY, CONSENT_REPLY, queueFallback, ROW_SELECT, runContext, sampleSettingsOf, sendStandalone, type RunContext } from './engine';
import { autoReplyKey, metaBody, phoneOf, sampleInput, selfConfirmAnswerOf, templateValues, waBodyProblems, waTemplateName, withinHours, type WaBodyProblem } from './pure';
import { selfConfirmReply } from './self-confirm';

// ---- the templates ----

export interface WaTemplateRow {
  id: string;
  key: string;
  locale: string;
  /** The name it has (or will have) with WhatsApp. */
  name: string;
  /** The provider's language code for it (`messages.whatsapp.languageCodes`). */
  language: string;
  /** How many values it takes ({{1}} …). */
  values: number;
  /** Why WhatsApp would refuse it for approval (the words need changing first); empty when none. */
  problems: WaBodyProblem[];
  providerTemplateId: string | null;
  /** PENDING, APPROVED, REJECTED, PAUSED, DISABLED; null = never sent for approval. */
  providerStatus: string | null;
  providerReason: string | null;
  providerCheckedAt: string | null;
}

export interface WaTemplatesScreen {
  provider: string | null;
  mode: string | null;
  /** The provider can list its templates and take new ones (the practice sender plays it). */
  canSync: boolean;
  templates: WaTemplateRow[];
  perms: { write: boolean };
}

async function senderOf(deps: MessagesDeps, storeId: number): Promise<Sender | null> {
  try {
    return await deps.sender(storeId, 'WHATSAPP');
  } catch {
    return null;
  }
}

async function rowsOf(deps: MessagesDeps, storeId: number): Promise<WaTemplateRow[]> {
  const [codes, rows] = await Promise.all([
    setting(deps, storeId, 'messages.whatsapp'),
    deps.db.notificationTemplate.findMany({
      where: { storeId, channel: 'WHATSAPP', archivedAt: null },
      orderBy: [{ key: 'asc' }, { locale: 'asc' }],
      select: { id: true, key: true, locale: true, body: true, providerTemplateId: true, providerStatus: true, providerReason: true, providerCheckedAt: true },
    }),
  ]);
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    locale: r.locale,
    name: r.providerTemplateId ?? waTemplateName(r.key),
    language: codes.languageCodes[r.locale === 'en' ? 'en' : 'bn'],
    values: metaBody(r.body).tokens.length,
    problems: waBodyProblems(r.body),
    providerTemplateId: r.providerTemplateId,
    providerStatus: r.providerStatus,
    providerReason: r.providerReason,
    providerCheckedAt: r.providerCheckedAt?.toISOString() ?? null,
  }));
}

/** The shop's WhatsApp templates with the provider's word on each (`messages.channels.read`). */
export async function waTemplatesScreen(deps: MessagesDeps, who: Who): Promise<WaTemplatesScreen> {
  await allow(deps, who, 'messages.channels.read');
  const [s, templates, write] = await Promise.all([senderOf(deps, who.storeId), rowsOf(deps, who.storeId), holds(deps, who, 'messages.channels.write')]);
  return { provider: s?.provider ?? null, mode: s?.mode ?? null, canSync: Boolean(s?.templates && s.submitTemplate), templates, perms: { write } };
}

const providerError = (e: unknown) => new MessagesError('PROVIDER_ERROR', 'the WhatsApp provider did not answer', [(e instanceof Error ? e.message : String(e)).slice(0, 200)]);

async function templatesSender(deps: MessagesDeps, storeId: number): Promise<Sender & Required<Pick<Sender, 'templates' | 'submitTemplate'>>> {
  const s = await senderOf(deps, storeId);
  if (!s?.templates || !s.submitTemplate) throw new MessagesError('INVALID_INPUT', 'this WhatsApp connection has no templates', ['provider']);
  return s as Sender & Required<Pick<Sender, 'templates' | 'submitTemplate'>>;
}

export interface WaSyncResult {
  /** Templates whose state was read from the provider. */
  matched: number;
  /** Templates whose state changed. */
  changed: number;
  screen: WaTemplatesScreen;
}

/** Reads the provider's word on every template again (`messages.channels.write`). */
export async function syncWaTemplates(deps: MessagesDeps, who: Who): Promise<WaSyncResult> {
  await allow(deps, who, 'messages.channels.write');
  const s = await templatesSender(deps, who.storeId);
  let theirs: Awaited<ReturnType<typeof s.templates>>;
  try {
    theirs = await s.templates();
  } catch (e) {
    throw providerError(e);
  }
  const now = nowOf(deps);
  const ours = await rowsOf(deps, who.storeId);
  let matched = 0;
  const changes: { key: string; locale: string; from: string | null; to: string }[] = [];
  for (const t of ours) {
    const hit = theirs.find((x) => x.name === t.name && x.language === t.language);
    if (!hit) continue;
    matched++;
    if (hit.status !== t.providerStatus || hit.reason !== t.providerReason) changes.push({ key: t.key, locale: t.locale, from: t.providerStatus, to: hit.status });
    await deps.db.notificationTemplate.update({ where: { id: t.id }, data: { providerTemplateId: hit.name, providerStatus: hit.status, providerReason: hit.reason?.slice(0, 300) ?? null, providerCheckedAt: now } });
  }
  await logChange(deps.db, who, { action: 'messages.whatsapp.sync', entityType: 'NotificationTemplate', entityId: String(who.storeId), before: null, after: { matched, changes } });
  return { matched, changed: changes.length, screen: await waTemplatesScreen(deps, who) };
}

/** Sends one template for the provider's approval (`messages.channels.write`); one already approved or waiting is not sent again. */
export async function submitWaTemplate(deps: MessagesDeps, who: Who, id: string): Promise<{ status: string; screen: WaTemplatesScreen }> {
  await allow(deps, who, 'messages.channels.write');
  const t = await deps.db.notificationTemplate.findFirst({ where: { id, storeId: who.storeId, channel: 'WHATSAPP', archivedAt: null }, select: { id: true, key: true, locale: true, body: true, providerStatus: true } });
  if (!t) throw new MessagesError('NOT_FOUND', 'no such WhatsApp template', ['id']);
  if (t.providerStatus === 'APPROVED' || t.providerStatus === 'PENDING') throw new MessagesError('INVALID_INPUT', 'this template is already approved or waiting for approval', ['status']);
  const problems = waBodyProblems(t.body);
  if (problems.length) throw new MessagesError('INVALID_INPUT', 'WhatsApp would refuse these words', problems);
  const s = await templatesSender(deps, who.storeId);
  const [cfg, sample] = await Promise.all([setting(deps, who.storeId, 'messages.whatsapp'), sampleSettingsOf(deps, who.storeId)]);
  const lang = t.locale === 'en' ? 'en' : 'bn';
  const name = waTemplateName(t.key);
  const draft = { name, language: cfg.languageCodes[lang], category: cfg.category, body: metaBody(t.body).text, examples: templateValues(t.body, sampleInput(sample, lang, 'cod')) };
  let r: Awaited<ReturnType<typeof s.submitTemplate>>;
  try {
    r = await s.submitTemplate(draft);
  } catch (e) {
    throw providerError(e);
  }
  await deps.db.notificationTemplate.update({ where: { id: t.id }, data: { providerTemplateId: name, providerStatus: r.status, providerReason: null, providerCheckedAt: nowOf(deps) } });
  await logChange(deps.db, who, { action: 'messages.whatsapp.submit', entityType: 'NotificationTemplate', entityId: t.id, before: { status: t.providerStatus }, after: { name, language: draft.language, category: draft.category, status: r.status } });
  return { status: r.status, screen: await waTemplatesScreen(deps, who) };
}

// ---- the receipts ----

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
const SENT_STATES: NonNullable<Prisma.NotificationLogCreateManyInput['status']>[] = ['SENT', 'DELIVERED'];

export interface ReceiptResult {
  delivered: number;
  failed: number;
  /** Receipts for no message of this store (another number of the account, or a message long gone). */
  unknown: number;
}

/** The provider's receipts for messages the shop sent: delivered and read → DELIVERED, failed → FAILED and the fallback. */
export async function recordWhatsAppReceipts(deps: MessagesDeps, storeId: number, receipts: WhatsAppReceipt[]): Promise<ReceiptResult> {
  const out: ReceiptResult = { delivered: 0, failed: 0, unknown: 0 };
  let c: RunContext | null = null;
  for (const r of receipts) {
    const row = await deps.db.notificationLog.findFirst({ where: { storeId, provider: WHATSAPP_CLOUD_PROVIDER, providerMessageId: r.messageId }, select: { ...ROW_SELECT, status: true, providerStatus: true, deliveredAt: true } });
    if (!row) {
      out.unknown++;
      continue;
    }
    if (r.status === 'failed') {
      // a message already delivered stays delivered; one still on its way failed
      if (row.status !== 'SENT') continue;
      c ??= await runContext(deps, storeId);
      await deps.db.notificationLog.update({ where: { id: row.id }, data: { status: 'FAILED', reason: r.notOnWhatsApp ? 'UNREACHABLE' : 'PROVIDER_FAILED', error: r.error?.slice(0, 300) ?? null, providerStatus: 'failed' } });
      await queueFallback(deps, c, row);
      out.failed++;
      continue;
    }
    if (!SENT_STATES.includes(row.status)) continue;
    const higher = (RANK[r.status] ?? 0) > (RANK[row.providerStatus ?? ''] ?? 0);
    if (r.status === 'sent') {
      if (higher) await deps.db.notificationLog.update({ where: { id: row.id }, data: { providerStatus: 'sent' } });
      continue;
    }
    await deps.db.notificationLog.update({ where: { id: row.id }, data: { status: 'DELIVERED', deliveredAt: row.deliveredAt ?? r.at ?? nowOf(deps), ...(higher ? { providerStatus: r.status } : {}) } });
    out.delivered++;
  }
  return out;
}

// ---- the customer's replies ----

export interface InboundResult {
  /** Self-confirm answers recorded. */
  answers: number;
  /** PR 298: stop and start words recorded. */
  stops: number;
  starts: number;
  /** Messages that were not an answer the shop reads by itself (left for the team). */
  other: number;
  /** PR 505: of those, the ones answered with the auto-reply. */
  autoReplies: number;
}

/**
 * The customer's WhatsApp replies: a stop or start word (PR 298: his answer recorded, and answered when
 * `messages.consent.confirmReply` is on), else a self-confirm answer ("1", "২" …) to a question asked within the reply
 * window.
 */
export async function handleWhatsAppInbound(deps: MessagesDeps, storeId: number, inbound: WhatsAppInbound[]): Promise<InboundResult> {
  const out: InboundResult = { answers: 0, stops: 0, starts: 0, other: 0, autoReplies: 0 };
  if (!inbound.length) return out;
  const [cfg, consent, auto] = await Promise.all([setting(deps, storeId, 'messages.whatsapp'), setting(deps, storeId, 'messages.consent'), setting(deps, storeId, 'messages.autoReply')]);
  const since = new Date(nowOf(deps).getTime() - cfg.replyWindowHours * 3_600_000);
  let c: RunContext | null = null;
  for (const m of inbound) {
    const said = await consentReply(deps, consent, storeId, { channel: 'WHATSAPP', phone: m.from, text: m.text });
    if (said) {
      if (said.word === 'stop') out.stops++;
      else out.starts++;
      if (consent.confirmReply) {
        c ??= await runContext(deps, storeId);
        const template = said.word === 'stop' ? CONSENT_TEMPLATES.stopped : CONSENT_TEMPLATES.started;
        await sendStandalone(deps, c, { channel: 'WHATSAPP', to: m.from, customerId: said.customerId, template, step: CONSENT_REPLY, dedupeKey: `consent:${m.messageId}` });
      }
      continue;
    }
    const answer = selfConfirmAnswerOf(m.text);
    const asked = answer
      ? await deps.db.notificationLog.findFirst({
          where: { storeId, step: 'selfConfirm', channel: 'WHATSAPP', recipient: m.from, status: { in: SENT_STATES }, sentAt: { gte: since }, orderId: { not: null } },
          orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
          select: { orderId: true },
        })
      : null;
    if (!answer || !asked?.orderId) {
      out.other++;
      // PR 505: the auto-reply (off as it ships), once per number in its window, never to a number that stopped messages
      if (auto.enabled && (await autoReplyFits(deps, storeId, auto))) {
        const phone = phoneOf(m.from);
        const customerId = phone ? await customerOf(deps.db, storeId, phone) : null;
        if (phone && !(await consentBlock(deps.db, storeId, consent, { channel: 'WHATSAPP', phone, customerId, step: AUTO_REPLY }))) {
          c ??= await runContext(deps, storeId);
          const sent = await sendStandalone(deps, c, { channel: 'WHATSAPP', to: m.from, customerId, template: auto.template, step: AUTO_REPLY, dedupeKey: autoReplyKey(phone, nowOf(deps), auto.onceEveryHours) });
          if (sent !== 'WAITING') out.autoReplies++;
        }
      }
      continue;
    }
    try {
      await selfConfirmReply(deps, storeId, asked.orderId, answer, systemBy('whatsapp'));
      out.answers++;
    } catch (e) {
      if (!(e instanceof MessagesError)) throw e;
      out.other++;
    }
  }
  return out;
}

/** PR 505 — the auto-reply goes `always`, or only outside the shop's hours (its time zone). */
async function autoReplyFits(deps: MessagesDeps, storeId: number, a: { when: string; openHour: number; closeHour: number }): Promise<boolean> {
  if (a.when === 'always') return true;
  return !withinHours(nowOf(deps), await setting(deps, storeId, 'store.timeZone'), a.openHour, a.closeHour);
}

/** PR 298 — the answers to a stop and a start (default pack; editable in Messages › Templates). */
export const CONSENT_TEMPLATES = { stopped: 'consent.stopped', started: 'consent.started' } as const;

// ---- the webhook ----

export interface WhatsAppWebhookDeps extends MessagesDeps {
  connections: Pick<Connections, 'secretOf'>;
  /** PR 426: the customers' messages go on to the Support inbox too (the app passes @extas/support's connector). It runs
   *  before any automatic answer, so a failure here answers 500 and the provider sends the post again (both sides
   *  take the same message once). */
  onInbound?: (storeId: number, inbound: WhatsAppInbound[]) => Promise<unknown>;
}

export type WhatsAppWebhookCode = 'OK' | 'NOT_CONNECTED' | 'TOO_LARGE' | 'BAD_SIGNATURE' | 'BAD_JSON';

export interface WhatsAppWebhookAnswer {
  status: number;
  code: WhatsAppWebhookCode;
  receipts?: ReceiptResult;
  replies?: InboundResult;
}

/** One secret of every WhatsApp Cloud connection switched on (a store's own, else the shared one), with its store. */
async function secretsOf(deps: WhatsAppWebhookDeps, field: 'appSecret' | 'verifyToken'): Promise<{ value: string; storeId: number }[]> {
  const rows = await deps.db.integration.findMany({ where: { kind: 'WHATSAPP', provider: WHATSAPP_CLOUD_PROVIDER, enabled: true, archivedAt: null }, select: { storeId: true } });
  const stores = [...new Set(rows.map((r) => r.storeId))];
  const found = await Promise.all(stores.map((s) => deps.connections.secretOf('WHATSAPP', field, { storeId: s, provider: WHATSAPP_CLOUD_PROVIDER })));
  return found.flatMap((f) => (f ? [{ value: f.value, storeId: f.storeId ?? MOTHER_STORE_ID }] : []));
}

/** The largest body the webhook reads (the mother store's setting: one address serves every store). */
export const whatsappWebhookMaxBytes = async (deps: Pick<MessagesDeps, 'settings'>): Promise<number> => (await setting(deps, MOTHER_STORE_ID, 'messages.whatsapp')).webhookMaxBodyKb * 1024;

/** A POST from the provider: checked against every app secret, then its receipts and replies are recorded. */
export async function receiveWhatsAppWebhook(deps: WhatsAppWebhookDeps, req: { rawBody: string; signature: string | null }): Promise<WhatsAppWebhookAnswer> {
  if (Buffer.byteLength(req.rawBody, 'utf8') > (await whatsappWebhookMaxBytes(deps))) return { status: 413, code: 'TOO_LARGE' };
  const secrets = await secretsOf(deps, 'appSecret');
  if (!secrets.length) return { status: 503, code: 'NOT_CONNECTED' };
  const match = secrets.find((s) => verifyWhatsAppSignature(req.rawBody, req.signature, s.value));
  if (!match) return { status: 401, code: 'BAD_SIGNATURE' };
  let body: unknown;
  try {
    body = JSON.parse(req.rawBody);
  } catch {
    return { status: 400, code: 'BAD_JSON' };
  }
  const { receipts, inbound } = parseWhatsAppWebhook(body);
  const r = await recordWhatsAppReceipts(deps, match.storeId, receipts);
  if (inbound.length && deps.onInbound) await deps.onInbound(match.storeId, inbound);
  const replies = await handleWhatsAppInbound(deps, match.storeId, inbound);
  return { status: 200, code: 'OK', receipts: r, replies };
}

const same = (a: string, b: string): boolean => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/** The provider's GET handshake: the challenge back when the verify token is one the owner typed in, else refused. */
export async function verifyWhatsAppWebhook(deps: WhatsAppWebhookDeps, q: { mode: string | null; token: string | null; challenge: string | null }): Promise<{ status: number; body: string }> {
  if (q.mode !== 'subscribe' || !q.token || !q.challenge) return { status: 403, body: 'FORBIDDEN' };
  const tokens = await secretsOf(deps, 'verifyToken');
  return tokens.some((t) => same(t.value, q.token!)) ? { status: 200, body: q.challenge.slice(0, 200) } : { status: 403, body: 'FORBIDDEN' };
}
