// S22 · PR 426 — the channel connectors (Blueprint B4.2, B4.10): Facebook Messenger, WhatsApp and the site's live chat
// plug into the support core here.
//
//   in:  a channel's webhook (the app's routes check Meta's signature first) hands its messages to `receiveFromChannel`;
//        each goes to the store's channel with that Page id / phone number id through `receiveMessage`. A channel that
//        is not added in Support, or is switched off, takes nothing (the message stays in Meta's own inbox: B4.10).
//   out: `supportChannelAdapters` gives `replyToConversation` an adapter per kind. Meta's rule is kept by design: a
//        Messenger or WhatsApp reply goes only within `support.channels.replyWindowHours` of the customer's last message;
//        outside it, or with files (not sent on these channels yet), the reply is kept and marked NOT_SENT with the reason.
//        A live-chat reply is "sent" once it is kept: the visitor's open chat reads it (livechat.ts).
//   admin: Support → Support settings lists the channels; a person with `support.settings` adds a Messenger Page or a
//        WhatsApp number (its id), renames it, switches it on or off, or puts it away (never deleted: its conversations
//        stay). Every change is audited.
// Nothing here sends anything by itself, moves money, changes an order, or blocks anyone.
import { z } from 'zod';
import type { ChannelSendResult, SupportChannelAdapter } from './channels';
import { allow, logChange, nowOf, parse, setting, SupportError, type SupportDeps, type Who } from './context';
import { receiveMessage } from './inbound';

/** The channels Meta carries, with their reply window. */
export const META_CHANNEL_KINDS = ['messenger', 'whatsapp'] as const;
export type MetaChannelKind = (typeof META_CHANNEL_KINDS)[number];

/** The live chat's one channel per store (its id on the site). */
export const LIVE_CHAT_EXTERNAL_ID = 'site';

/** Why a reply was not sent on a Meta channel (the inbox has words for each). */
export const CHANNEL_SEND_REFUSALS = ['OUTSIDE_WINDOW', 'FILES_NOT_SENT', 'LIVE_CHAT_OFF'] as const;

// ------------------------------------------------------------------------------------------------------------- in

/** One message a channel's webhook brought, already checked as the channel's own. */
export interface ChannelInbound {
  /** The Page id (Messenger) or the phone number id (WhatsApp) it came to. */
  channelExternalId: string;
  /** The person: a PSID (Messenger) or a number in +country form (WhatsApp). */
  from: string;
  name?: string;
  phone?: string;
  messageId: string;
  text: string;
  files: { kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER'; sourceUrl: string; fileName?: string; contentType?: string }[];
  at: Date;
}

export interface ChannelReceiveResult {
  received: number;
  duplicate: number;
  /** Not taken: no such channel in Support, switched off, or nothing in it (a reaction, a sticker with no file). */
  skipped: number;
}

/** A webhook's messages into the inbox of the store whose channel they came to. Safe to call again. */
export async function receiveFromChannel(deps: SupportDeps, storeId: number, kind: MetaChannelKind, items: readonly ChannelInbound[]): Promise<ChannelReceiveResult> {
  const out: ChannelReceiveResult = { received: 0, duplicate: 0, skipped: 0 };
  for (const m of items) {
    const channel = await deps.db.supportChannel.findUnique({ where: { storeId_kind_externalId: { storeId, kind, externalId: m.channelExternalId } }, select: { enabled: true, archivedAt: true } });
    if (!channel || !channel.enabled || channel.archivedAt) {
      out.skipped++;
      continue;
    }
    try {
      const r = await receiveMessage(deps, {
        storeId,
        channel: { kind, externalId: m.channelExternalId },
        contact: { externalId: m.from, ...(m.name?.trim() ? { name: m.name.trim().slice(0, 120) } : {}), ...(m.phone ? { phone: m.phone } : {}) },
        message: { externalId: m.messageId, ...(m.text ? { text: m.text } : {}), sentAt: m.at, files: m.files.slice(0, 20) },
      });
      if (r.duplicate) {
        out.duplicate++;
        continue;
      }
      out.received++;
      // Meta's reply window, kept on the conversation for the inbox (PR 431 shows it); messages may come out of order
      const ends = new Date(m.at.getTime() + (await setting(deps, storeId, 'support.channels')).replyWindowHours * 3_600_000);
      await deps.db.conversation.updateMany({ where: { id: r.conversationId, OR: [{ windowExpiresAt: null }, { windowExpiresAt: { lt: ends } }] }, data: { windowExpiresAt: ends } });
    } catch (e) {
      if (e instanceof SupportError && (e.code === 'EMPTY' || e.code === 'INVALID_INPUT' || e.code === 'NOT_FOUND')) out.skipped++;
      else throw e;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------ out

const refused = (code: (typeof CHANNEL_SEND_REFUSALS)[number]): ChannelSendResult => ({ ok: false, error: code, notSent: true });

/** What a Meta channel's sender needs: the store, the person and the words. */
export type MetaSend = (storeId: number, to: string, text: string) => Promise<ChannelSendResult>;

export interface ConnectorSenders {
  messenger?: MetaSend;
  whatsapp?: MetaSend;
}

/** When the customer last wrote in this conversation (Meta's reply window counts from there). */
async function lastInbound(deps: Pick<SupportDeps, 'db'>, conversationId: string): Promise<Date | null> {
  const m = await deps.db.message.findFirst({ where: { conversationId, direction: 'IN' }, orderBy: { sentAt: 'desc' }, select: { sentAt: true } });
  return m?.sentAt ?? null;
}

function metaAdapter(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, kind: MetaChannelKind, send: MetaSend): SupportChannelAdapter {
  return {
    kind,
    async send(m) {
      // files do not go out on these channels yet: the words go alone, or the reply is kept
      if (m.files.length || !m.text?.trim()) return refused('FILES_NOT_SENT');
      const { replyWindowHours } = await setting(deps, m.storeId, 'support.channels');
      const last = await lastInbound(deps, m.conversationId);
      if (!last || nowOf(deps).getTime() - last.getTime() > replyWindowHours * 3_600_000) return refused('OUTSIDE_WINDOW');
      return send(m.storeId, m.contact.externalId, m.text);
    },
  };
}

function liveChatAdapter(deps: Pick<SupportDeps, 'settings'>): SupportChannelAdapter {
  return {
    kind: 'livechat',
    async send(m) {
      if (!(await setting(deps, m.storeId, 'support.liveChat')).enabled) return refused('LIVE_CHAT_OFF');
      // the chat window shows words only for now
      if (m.files.length || !m.text?.trim()) return refused('FILES_NOT_SENT');
      // the visitor's open chat reads the reply from the conversation (livechat.ts)
      return { ok: true, externalMessageId: `livechat:${m.messageId}` };
    },
  };
}

/** The adapters `replyToConversation` sends through (a kind with no sender is left out: its replies are NOT_SENT). */
export function supportChannelAdapters(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, senders: ConnectorSenders): NonNullable<SupportDeps['channels']> {
  return {
    livechat: liveChatAdapter(deps),
    ...(senders.messenger ? { messenger: metaAdapter(deps, 'messenger', senders.messenger) } : {}),
    ...(senders.whatsapp ? { whatsapp: metaAdapter(deps, 'whatsapp', senders.whatsapp) } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------- admin

export interface SupportChannelRow {
  id: string;
  kind: string;
  externalId: string;
  name: string;
  enabled: boolean;
  archived: boolean;
  conversations: number;
  /** For the live chat: the shop's switch (`support.liveChat.enabled`); the channel row alone does not show the button. */
  liveChatOn: boolean | null;
  version: string;
}

/** The store's channels (`support.read`), switched on first, then by kind and name. */
export async function supportChannels(deps: Pick<SupportDeps, 'db' | 'settings'>, who: Who): Promise<{ rows: SupportChannelRow[]; canEdit: boolean }> {
  const held = await allow(deps, who, 'support.read');
  const [rows, counts, live] = await Promise.all([
    // CN-020 (3): the checkout's call-back channel is not a channel to connect, switch or rename
    deps.db.supportChannel.findMany({ where: { storeId: who.storeId, kind: { not: 'callback' } }, orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { enabled: 'desc' }, { kind: 'asc' }, { name: 'asc' }] }),
    deps.db.conversation.groupBy({ by: ['channelId'], where: { storeId: who.storeId }, _count: { _all: true } }),
    setting(deps, who.storeId, 'support.liveChat'),
  ]);
  const n = new Map(counts.map((c) => [c.channelId, c._count._all]));
  return {
    canEdit: held.has('support.settings'),
    rows: rows.map((c) => ({
      id: c.id,
      kind: c.kind,
      externalId: c.externalId,
      name: c.name,
      enabled: c.enabled,
      archived: !!c.archivedAt,
      conversations: n.get(c.id) ?? 0,
      liveChatOn: c.kind === 'livechat' ? live.enabled : null,
      version: c.updatedAt.toISOString(),
    })),
  };
}

const idOf = z.string().trim().regex(/^\d{5,30}$/, { message: 'digits only (the id from the Meta app)' });

export const saveChannelInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), kind: z.enum(META_CHANNEL_KINDS), externalId: idOf, name: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal('rename'), id: z.uuid(), name: z.string().trim().min(1).max(80), version: z.string().max(40).optional() }).strict(),
  z.object({ action: z.literal('switch'), id: z.uuid(), enabled: z.boolean(), version: z.string().max(40).optional() }).strict(),
  z.object({ action: z.literal('archive'), id: z.uuid(), archived: z.boolean(), version: z.string().max(40).optional() }).strict(),
]);

/** Adds, renames, switches or puts away a channel (`support.settings`); audited. Never deletes one. */
export async function saveSupportChannel(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who, input: unknown): Promise<{ id: string }> {
  await allow(deps, who, 'support.settings');
  const d = parse(saveChannelInput, input, 'channel');
  if (d.action === 'add') {
    const had = await deps.db.supportChannel.findUnique({ where: { storeId_kind_externalId: { storeId: who.storeId, kind: d.kind, externalId: d.externalId } } });
    if (had) throw new SupportError('INVALID_INPUT', 'this channel is added already', ['externalId']);
    // added off: the owner switches it on once the connection's keys are in (Keys & connections)
    const made = await deps.db.supportChannel.create({ data: { storeId: who.storeId, kind: d.kind, externalId: d.externalId, name: d.name, enabled: false } });
    await logChange(deps.db, who, { action: 'support.channel.add', entityType: 'SupportChannel', entityId: made.id, before: null, after: { kind: d.kind, externalId: d.externalId, name: d.name, enabled: false } });
    return { id: made.id };
  }
  const c = await deps.db.supportChannel.findFirst({ where: { id: d.id, storeId: who.storeId } });
  if (!c) throw new SupportError('NOT_FOUND', 'no such channel', ['id']);
  if (d.version !== undefined && d.version !== c.updatedAt.toISOString()) throw new SupportError('STALE', 'the channel changed; read it again', ['version'], { version: c.updatedAt.toISOString() });
  const data =
    d.action === 'rename' ? { name: d.name } : d.action === 'switch' ? { enabled: d.enabled } : { archivedAt: d.archived ? (c.archivedAt ?? nowOf(deps)) : null, ...(d.archived ? { enabled: false } : {}) };
  const after = await deps.db.supportChannel.update({ where: { id: c.id }, data });
  await logChange(deps.db, who, {
    action: `support.channel.${d.action}`,
    entityType: 'SupportChannel',
    entityId: c.id,
    before: { name: c.name, enabled: c.enabled, archived: !!c.archivedAt },
    after: { name: after.name, enabled: after.enabled, archived: !!after.archivedAt },
  });
  return { id: c.id };
}
