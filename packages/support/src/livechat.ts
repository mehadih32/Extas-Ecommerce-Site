// S22 · PR 426 — the site's own live chat (Blueprint B4.2): a visitor writes from the shop's chat button and the team
// answers from the same inbox as Messenger and WhatsApp. Off as it ships (`support.liveChat.enabled`); the owner
// switches it on in Support → Support settings.
//
// A visitor is a random token the browser keeps in a cookie the page's scripts cannot read (the app sets it); only its
// hash is stored, as the chat contact's id, so a database copy cannot be used to read someone's chat. A visitor sees
// his own messages and the team's sent answers, never an internal note, a reply that did not go out, or who in the team
// wrote it. A visitor may send `perMinute` messages a minute of at most `maxChars` characters; one press of Send
// carries a key, so pressed twice it is one message. The store's chat channel (kind `livechat`, id `site`) is made the
// first time it is needed; a team member can rename it or switch it off like any channel (connectors.ts).
// Nothing here sends anything outside the site, moves money, changes an order, or blocks anyone.
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { LIVE_CHAT_EXTERNAL_ID } from './connectors';
import { checkStoreId, nowOf, parse, setting, SupportError, type SupportDeps } from './context';
import { receiveMessage } from './inbound';

export const LIVE_CHAT_KIND = 'livechat';

/** A new visitor token (the app keeps it in an httpOnly cookie). */
export const newVisitorToken = (): string => randomBytes(24).toString('base64url');

/** A token as the browser sends it: 32 url-safe characters (anything else is a new visitor). */
export const isVisitorToken = (t: string | null | undefined): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t);

/** The contact id a token is kept under (its hash, never the token). */
export const visitorIdOf = (token: string): string => `v_${createHash('sha256').update(token).digest('hex').slice(0, 40)}`;

/** Why a visitor's message was refused (the chat window has words for each). */
export const LIVE_CHAT_REFUSALS = ['LIVE_CHAT_OFF', 'RATE_LIMITED', 'TOO_LONG', 'EMPTY', 'INVALID_INPUT'] as const;
export type LiveChatRefusal = (typeof LIVE_CHAT_REFUSALS)[number];

export class LiveChatError extends Error {
  constructor(
    public readonly code: LiveChatRefusal,
    public readonly data?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'LiveChatError';
  }

  get status(): number {
    if (this.code === 'LIVE_CHAT_OFF') return 404;
    if (this.code === 'RATE_LIMITED') return 429;
    return 400;
  }
}

export interface LiveChatState {
  on: boolean;
  /** How often the open chat asks for answers, and the longest message (the settings, for the window). */
  pollSeconds: number;
  maxChars: number;
}

type ChatDeps = Pick<SupportDeps, 'db' | 'settings' | 'now'>;

/** Is the chat on for this store: the setting is on and its channel is not switched off or put away. */
export async function liveChatState(deps: ChatDeps, storeId: number): Promise<LiveChatState> {
  checkStoreId(storeId);
  const s = await setting(deps, storeId, 'support.liveChat');
  let on = s.enabled;
  if (on) {
    const ch = await deps.db.supportChannel.findUnique({ where: { storeId_kind_externalId: { storeId, kind: LIVE_CHAT_KIND, externalId: LIVE_CHAT_EXTERNAL_ID } }, select: { enabled: true, archivedAt: true } });
    if (ch && (!ch.enabled || ch.archivedAt)) on = false;
  }
  return { on, pollSeconds: s.pollSeconds, maxChars: s.maxChars };
}

/** The store's chat channel, made (switched on) the first time it is needed. `name` is how the inbox calls it. */
export async function ensureLiveChatChannel(deps: Pick<SupportDeps, 'db'>, storeId: number, name: string): Promise<{ id: string }> {
  checkStoreId(storeId);
  const label = name.trim().slice(0, 80) || LIVE_CHAT_EXTERNAL_ID;
  return deps.db.supportChannel.upsert({
    where: { storeId_kind_externalId: { storeId, kind: LIVE_CHAT_KIND, externalId: LIVE_CHAT_EXTERNAL_ID } },
    create: { storeId, kind: LIVE_CHAT_KIND, externalId: LIVE_CHAT_EXTERNAL_ID, name: label, enabled: true },
    update: {},
    select: { id: true },
  });
}

export interface LiveChatLine {
  id: string;
  /** `me`: the visitor; `shop`: the team's answer. */
  from: 'me' | 'shop';
  text: string;
  at: string;
}

/** How many of the latest lines the chat window shows. */
const THREAD_LINES = 50; // hardcode-ok: technical window size (lines drawn), not a business limit

/** The visitor's thread: his messages and the team's sent answers, oldest first (the last `limit`). */
export async function liveChatThread(deps: ChatDeps, storeId: number, token: string, limit = THREAD_LINES): Promise<{ state: LiveChatState; lines: LiveChatLine[] }> {
  const state = await liveChatState(deps, storeId);
  if (!state.on || !isVisitorToken(token)) return { state, lines: [] };
  const conv = await deps.db.conversation.findFirst({
    where: { storeId, channel: { kind: LIVE_CHAT_KIND, externalId: LIVE_CHAT_EXTERNAL_ID }, contact: { channelKind: LIVE_CHAT_KIND, externalId: visitorIdOf(token) } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!conv) return { state, lines: [] };
  const rows = await deps.db.message.findMany({
    where: { conversationId: conv.id, isInternalNote: false, OR: [{ direction: 'IN' }, { direction: 'OUT', status: 'SENT' }] },
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(1, limit), 200),
    select: { id: true, direction: true, body: true, sentAt: true },
  });
  return {
    state,
    lines: rows
      .reverse()
      .filter((m) => m.body)
      .map((m) => ({ id: m.id, from: m.direction === 'IN' ? 'me' : 'shop', text: m.body!, at: m.sentAt.toISOString() })),
  };
}

export const liveChatPostInput = z
  .object({
    text: z.string().max(8000),
    /** The visitor's name, when he gives one. */
    name: z.string().trim().max(80).optional(),
    requestKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  })
  .strict();

/** A visitor's message into the inbox. `channelName` names the chat channel if this makes it. */
export async function postLiveChat(deps: ChatDeps, storeId: number, token: string, input: unknown, channelName: string): Promise<{ duplicate: boolean }> {
  const state = await liveChatState(deps, storeId);
  if (!state.on) throw new LiveChatError('LIVE_CHAT_OFF');
  if (!isVisitorToken(token)) throw new LiveChatError('INVALID_INPUT');
  let d: z.output<typeof liveChatPostInput>;
  try {
    d = parse(liveChatPostInput, input, 'chat message');
  } catch {
    throw new LiveChatError('INVALID_INPUT');
  }
  const text = d.text.trim();
  if (!text) throw new LiveChatError('EMPTY');
  if (text.length > state.maxChars) throw new LiveChatError('TOO_LONG', { max: state.maxChars });
  const { perMinute } = await setting(deps, storeId, 'support.liveChat');
  const visitor = visitorIdOf(token);
  const now = nowOf(deps);
  const recent = await deps.db.message.count({
    where: { storeId, direction: 'IN', sentAt: { gt: new Date(now.getTime() - 60_000) }, conversation: { channel: { kind: LIVE_CHAT_KIND }, contact: { channelKind: LIVE_CHAT_KIND, externalId: visitor } } },
  });
  // a second press of the same Send is let through: receiveMessage answers it as the same message
  const again = recent >= perMinute ? await deps.db.message.findFirst({ where: { storeId, externalMessageId: `lc:${d.requestKey}`, conversation: { contact: { externalId: visitor } } }, select: { id: true } }) : null;
  if (recent >= perMinute && !again) throw new LiveChatError('RATE_LIMITED', { perMinute });
  await ensureLiveChatChannel(deps, storeId, channelName);
  try {
    const r = await receiveMessage(deps, {
      storeId,
      channel: { kind: LIVE_CHAT_KIND, externalId: LIVE_CHAT_EXTERNAL_ID },
      contact: { externalId: visitor, ...(d.name ? { name: d.name } : {}) },
      message: { externalId: `lc:${d.requestKey}`, text, sentAt: now },
    });
    return { duplicate: r.duplicate };
  } catch (e) {
    if (e instanceof SupportError && e.code === 'EMPTY') throw new LiveChatError('EMPTY');
    if (e instanceof SupportError && e.code === 'NOT_FOUND') throw new LiveChatError('LIVE_CHAT_OFF');
    throw e;
  }
}
