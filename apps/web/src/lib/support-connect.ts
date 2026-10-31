// S22 · PR 426 — the Support inbox's channels in the app (Blueprint B4.2, B4.10): the reply senders through the
// connection layer (Keys & connections; each the practice mock until its key is typed in), Facebook Messenger's webhook
// (a signed POST from Meta, no session), and WhatsApp's customer messages handed on from its webhook (PR 292).
//
//   Messenger: GET is Meta's handshake (the challenge back only for a verify token in the vault); a POST is checked
//   against the app secret of every Messenger connection switched on, and its messages go to the matching store's
//   channel with that Page id (@extas/support receiveFromChannel). A Page not added in Support, or switched off, takes
//   nothing. A body over `support.channels.webhookMaxBodyKb` is refused before it is read.
//   WhatsApp: the messages of a verified post go to the store's channel with that phone number id the same way.
// Nothing here sends anything by itself, moves money, changes an order, or blocks anyone.
import {
  createConnections,
  MESSENGER_PAGE_PROVIDER,
  parseMessengerWebhook,
  supportAdapters,
  verifyWhatsAppSignature,
  whatsappMediaUrl,
  type Connections,
  type MessengerSender,
  type WhatsAppInbound,
  type WhatsAppSender,
} from '@extas/adapters';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import * as sp from '@extas/support';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { AdminDeps } from './admin-auth';

type Reader = sp.SupportDeps['settings'];

const holder = globalThis as unknown as { __supportConnections?: { connections: Connections; at: number; ttlMs: number } };

/** One connection layer for this process, so the keys are read from the vault once per cache period, not per message. */
export async function supportConnections(deps: AdminDeps): Promise<Connections> {
  const now = Date.now();
  const hit = holder.__supportConnections;
  if (hit && now - hit.at < hit.ttlMs) return hit.connections;
  const [testSeconds, cacheSeconds] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const connections = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: supportAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
  holder.__supportConnections = { connections, at: now, ttlMs: cacheSeconds * 1000 };
  return connections;
}

/** The senders `replyToConversation` uses, each through the store's connection (read when a reply goes out). */
export function supportSenders(connections: () => Promise<Pick<Connections, 'use'>>): sp.ConnectorSenders {
  return {
    async messenger(storeId, to, text) {
      const c = await (await connections()).use<MessengerSender>('MESSENGER', { storeId });
      const r = await c.api.send({ to, text });
      return r.ok ? { ok: true, externalMessageId: r.messageId } : { ok: false, error: r.error };
    },
    async whatsapp(storeId, to, text) {
      const c = await (await connections()).use<WhatsAppSender>('WHATSAPP', { storeId });
      const r = await c.api.send({ to, text, purpose: 'support.reply' });
      return r.ok ? { ok: true, externalMessageId: r.messageId } : { ok: false, error: r.error };
    },
  };
}

// --------------------------------------------------------------------------------------------------------- WhatsApp

/** A WhatsApp webhook's customer messages as the inbox takes them (a message with no phone number id is left out). */
export function whatsappToSupport(inbound: readonly WhatsAppInbound[]): sp.ChannelInbound[] {
  return inbound.flatMap((m) =>
    m.phoneNumberId
      ? [
          {
            channelExternalId: m.phoneNumberId,
            from: m.from,
            phone: m.from,
            ...(m.name ? { name: m.name } : {}),
            messageId: m.messageId,
            text: m.text,
            files: (m.files ?? []).map((f) => ({ kind: f.kind, sourceUrl: whatsappMediaUrl(f.mediaId), ...(f.fileName ? { fileName: f.fileName } : {}), ...(f.contentType ? { contentType: f.contentType } : {}) })),
            at: m.at,
          },
        ]
      : [],
  );
}

// -------------------------------------------------------------------------------------------------------- Messenger

export interface MessengerWebhookDeps {
  db: PrismaClient;
  settings: Reader;
  connections: Pick<Connections, 'secretOf'>;
  now?: () => Date;
}

export type MessengerWebhookCode = 'OK' | 'NOT_CONNECTED' | 'TOO_LARGE' | 'BAD_SIGNATURE' | 'BAD_JSON';

/** One key of every Messenger Page connection switched on (a store's own, else the shared one), with its store. */
async function secretsOf(deps: MessengerWebhookDeps, field: 'appSecret' | 'verifyToken'): Promise<{ value: string; storeId: number }[]> {
  const rows = await deps.db.integration.findMany({ where: { kind: 'MESSENGER', provider: MESSENGER_PAGE_PROVIDER, enabled: true, archivedAt: null }, select: { storeId: true } });
  const stores = [...new Set(rows.map((r) => r.storeId))];
  const found = await Promise.all(stores.map((s) => deps.connections.secretOf('MESSENGER', field, { storeId: s, provider: MESSENGER_PAGE_PROVIDER })));
  return found.flatMap((f) => (f ? [{ value: f.value, storeId: f.storeId ?? MOTHER_STORE_ID }] : []));
}

/** The largest body the webhook reads (the mother store's setting: one address serves every store). */
export const messengerWebhookMaxBytes = async (settings: Reader): Promise<number> => (await settings.value('support.channels', { storeId: MOTHER_STORE_ID })).webhookMaxBodyKb * 1024;

/** A POST from Meta: checked against every app secret, then the people's messages go to the store's Page channels. */
export async function receiveMessengerWebhook(deps: MessengerWebhookDeps, req: { rawBody: string; signature: string | null }): Promise<{ status: number; code: MessengerWebhookCode; result?: sp.ChannelReceiveResult }> {
  if (Buffer.byteLength(req.rawBody, 'utf8') > (await messengerWebhookMaxBytes(deps.settings))) return { status: 413, code: 'TOO_LARGE' };
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
  const items: sp.ChannelInbound[] = parseMessengerWebhook(body).map((m) => ({ channelExternalId: m.pageId, from: m.from, messageId: m.messageId, text: m.text, files: m.files.map((f) => ({ kind: f.kind, sourceUrl: f.url })), at: m.at }));
  const result = await sp.receiveFromChannel({ db: deps.db, settings: deps.settings, now: deps.now }, match.storeId, 'messenger', items);
  return { status: 200, code: 'OK', result };
}

const same = (a: string, b: string): boolean => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/** Meta's GET handshake: the challenge back when the verify token is one the owner typed in, else refused. */
export async function verifyMessengerWebhook(deps: MessengerWebhookDeps, q: { mode: string | null; token: string | null; challenge: string | null }): Promise<{ status: number; body: string }> {
  if (q.mode !== 'subscribe' || !q.token || !q.challenge) return { status: 403, body: 'FORBIDDEN' };
  const tokens = await secretsOf(deps, 'verifyToken');
  return tokens.some((t) => same(t.value, q.token!)) ? { status: 200, body: q.challenge.slice(0, 200) } : { status: 403, body: 'FORBIDDEN' };
}
