// S14 · PR 298 — consent and opt-out, honoured on every channel (B5.7, BACKEND-ARCHITECTURE §8.8). Every answer is a
// dated ConsentRecord row (append-only; the newest row per number or account, channel and scope is the answer):
// - scope MARKETING: offers — the checkout ticks (PR 123), the customer's own account ticks, and a stop that covers
//   only offers;
// - scope ALL: every message on that channel, order updates too — the customer's stop word in a reply (WhatsApp; an
//   SMS gateway's replies join when one sends them), or his request through the team (`messages.consent.write`).
// The engine asks `consentBlock` before every send (engine.ts sendOne): a number whose newest ALL answer is "no" gets
// nothing on that channel (SKIPPED OPTED_OUT; the step's fallback channel is tried, and asked again there); a journey
// step listed as an offer (`messages.consent.offerSteps`) goes only when the newest offers answer is "yes" (else
// NO_CONSENT). A start word, or the team at his request, takes a stop back. `messages.consent.confirmReply` (off)
// answers a stop or start with the `consent.stopped` / `consent.started` template. Nothing here sends on its own.
import type { Prisma } from '@extas/db/client';
import { MESSAGE_CHANNELS, type ConsentSettings, type MessageChannel } from '@extas/settings';
import { z } from 'zod';
import { allow, holds, logChange, MessagesError, nowOf, parse, type Db, type MessagesDeps, type SettingsWriter, type Who } from './context';
import { readGroup, saveGroup, groupVersion } from './channels';
import { consentWordOf, phoneOf } from './pure';

/** What an answer is about: every message on the channel, or offers only. */
export type ConsentScope = 'ALL' | 'MARKETING';
export const CONSENT_SCOPES: readonly ConsentScope[] = ['ALL', 'MARKETING'];

/** Where an answer came from (ConsentRecord.source); the checkout's and the account's own are in their packages. */
export const CONSENT_SOURCES = { reply: 'reply', staff: 'staff' } as const;

/** Why a message was not sent (NotificationLog.reason). */
export type ConsentBlock = 'OPTED_OUT' | 'NO_CONSENT';

const whoOf = (phone: string | null, customerId: string | null): Prisma.ConsentRecordWhereInput[] => [...(phone ? [{ phone }] : []), ...(customerId ? [{ customerId }] : [])];

async function newest(db: Db, storeId: number, channel: MessageChannel, scope: ConsentScope, or: Prisma.ConsentRecordWhereInput[]): Promise<boolean | null> {
  if (!or.length) return null;
  const r = await db.consentRecord.findFirst({ where: { storeId, channel, scope, OR: or }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { granted: true } });
  return r ? r.granted : null;
}

/**
 * Before every send: may this message go to this number (and account) on this channel? A stop of every message wins;
 * an offer step needs the customer's yes for offers. null = it may go.
 */
export async function consentBlock(db: Db, storeId: number, cfg: Pick<ConsentSettings, 'offerSteps'>, m: { channel: MessageChannel; phone: string | null; customerId: string | null; step: string | null }): Promise<ConsentBlock | null> {
  const or = whoOf(m.phone, m.customerId);
  if ((await newest(db, storeId, m.channel, 'ALL', or)) === false) return 'OPTED_OUT';
  if (m.step && (cfg.offerSteps as readonly string[]).includes(m.step) && (await newest(db, storeId, m.channel, 'MARKETING', or)) !== true) return 'NO_CONSENT';
  return null;
}

export interface ConsentChange {
  phone: string;
  customerId: string | null;
  channels: readonly MessageChannel[];
  scope: ConsentScope;
  granted: boolean;
  source: string;
  recordedById?: string | null;
}

/** New answers, one row per channel (nothing is changed or deleted). */
export async function recordConsentChange(db: Db, storeId: number, c: ConsentChange, at: Date): Promise<number> {
  const r = await db.consentRecord.createMany({ data: c.channels.map((channel) => ({ storeId, phone: c.phone, customerId: c.customerId, channel, scope: c.scope, granted: c.granted, source: c.source, recordedById: c.recordedById ?? null, createdAt: at })) });
  return r.count;
}

/** The customer behind a number in this store, when he has an account. */
async function customerOf(db: Db, storeId: number, phone: string): Promise<string | null> {
  return (await db.customer.findFirst({ where: { storeId, phone, archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id ?? null;
}

export interface ConsentReplyResult {
  word: 'stop' | 'start';
  channels: MessageChannel[];
  scope: ConsentScope;
}

/**
 * A customer's reply on a channel: a stop or start word records his answer (`messages.consent`: what it covers, which
 * channels). Anything else: null (left for the self-confirm and the team).
 */
export async function consentReply(deps: Pick<MessagesDeps, 'db' | 'now'>, cfg: ConsentSettings, storeId: number, m: { channel: MessageChannel; phone: string; text: string }): Promise<(ConsentReplyResult & { customerId: string | null }) | null> {
  const word = consentWordOf(cfg, m.text);
  const phone = phoneOf(m.phone);
  if (!word || !phone) return null;
  const channels = cfg.stopChannels === 'allChannels' ? [...MESSAGE_CHANNELS] : [m.channel];
  const scope: ConsentScope = cfg.stopCovers === 'everything' ? 'ALL' : 'MARKETING';
  const customerId = await customerOf(deps.db, storeId, phone);
  await recordConsentChange(deps.db, storeId, { phone, customerId, channels, scope, granted: word === 'start', source: CONSENT_SOURCES.reply }, nowOf(deps));
  return { word, channels, scope, customerId };
}

// ---- Messages › Consent (the admin page) ----

/** The setting the page edits. */
export const CONSENT_SETTINGS = { consent: 'messages.consent' } as const;

export interface ConsentRow {
  id: string;
  phone: string | null;
  channel: MessageChannel;
  scope: ConsentScope;
  granted: boolean;
  source: string;
  /** The staff member who recorded it (his display name), or null for the customer's own answer. */
  recordedBy: string | null;
  createdAt: string;
}

/** One channel's answers for a number: every message (null = never said) and offers (null = never asked). */
export interface ConsentState {
  channel: MessageChannel;
  all: boolean | null;
  offers: boolean | null;
}

export interface ConsentScreen {
  config: ConsentSettings;
  version: string;
  /** Answers in the last 30 days: stops of every message, and offers said no to. */
  counts: { stops: number; starts: number; offersNo: number };
  recent: ConsentRow[];
  lookup: { phone: string; customer: boolean; states: ConsentState[]; history: ConsentRow[] } | null;
  perms: { write: boolean };
}

const DAY = 86_400_000;

async function rowsOf(db: Db, where: Prisma.ConsentRecordWhereInput, take: number): Promise<ConsentRow[]> {
  const rows = await db.consentRecord.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { id: true, phone: true, channel: true, scope: true, granted: true, source: true, recordedById: true, createdAt: true } });
  const ids = [...new Set(rows.flatMap((r) => (r.recordedById ? [r.recordedById] : [])))];
  const names = new Map((ids.length ? await db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : []).map((s) => [s.id, s.displayName]));
  return rows.map((r) => ({ id: r.id, phone: r.phone, channel: r.channel as MessageChannel, scope: r.scope === 'ALL' ? 'ALL' : 'MARKETING', granted: r.granted, source: r.source, recordedBy: r.recordedById ? (names.get(r.recordedById) ?? null) : null, createdAt: r.createdAt.toISOString() }));
}

/** A number as staff type it (any Bangladeshi form, or +country), or a refusal. */
function phoneInput(raw: unknown): string {
  const p = typeof raw === 'string' ? phoneOf(raw) : null;
  if (!p) throw new MessagesError('INVALID_INPUT', 'the phone number is not valid', ['phone']);
  return p;
}

/** The consent page: the stop words, the last 30 days, the newest answers, and one number's answers (`messages.consent.view`). */
export async function consentScreen(deps: MessagesDeps, who: Who, q: { phone?: string | null } = {}): Promise<ConsentScreen> {
  await allow(deps, who, 'messages.consent.view');
  const since = new Date(nowOf(deps).getTime() - 30 * DAY);
  const base = { storeId: who.storeId, createdAt: { gte: since } };
  const [group, write, stops, starts, offersNo, recent] = await Promise.all([
    readGroup(deps, who.storeId, CONSENT_SETTINGS),
    holds(deps, who, 'messages.consent.write'),
    deps.db.consentRecord.count({ where: { ...base, scope: 'ALL', granted: false } }),
    deps.db.consentRecord.count({ where: { ...base, scope: 'ALL', granted: true } }),
    deps.db.consentRecord.count({ where: { ...base, scope: 'MARKETING', granted: false } }),
    rowsOf(deps.db, { storeId: who.storeId }, 50),
  ]);
  let lookup: ConsentScreen['lookup'] = null;
  if (q.phone?.trim()) {
    const phone = phoneInput(q.phone);
    const customerId = await customerOf(deps.db, who.storeId, phone);
    const or = whoOf(phone, customerId);
    const states = await Promise.all(MESSAGE_CHANNELS.map(async (channel) => ({ channel, all: await newest(deps.db, who.storeId, channel, 'ALL', or), offers: await newest(deps.db, who.storeId, channel, 'MARKETING', or) })));
    lookup = { phone, customer: customerId !== null, states, history: await rowsOf(deps.db, { storeId: who.storeId, OR: or }, 50) };
  }
  return { config: group.consent, version: groupVersion(group), counts: { stops, starts, offersNo }, recent, lookup, perms: { write } };
}

/** Saves the stop words and their rules (`messages.consent.write`); STALE over a newer save. */
export async function saveConsentSettings(deps: MessagesDeps & { settings: MessagesDeps['settings'] & SettingsWriter }, who: Who, input: unknown, version?: string): Promise<ConsentScreen> {
  await allow(deps, who, 'messages.consent.write');
  await saveGroup(deps, who, CONSENT_SETTINGS, input, version, { name: 'consent settings', reason: 'Messages › Consent', action: 'messages.consent.save', entityType: 'MessageConsent' });
  return consentScreen(deps, who);
}

/** What the team records at the customer's request. */
export const CONSENT_ACTIONS = { stopAll: { scope: 'ALL', granted: false }, allowAll: { scope: 'ALL', granted: true }, stopOffers: { scope: 'MARKETING', granted: false }, allowOffers: { scope: 'MARKETING', granted: true } } as const satisfies Record<string, { scope: ConsentScope; granted: boolean }>;
export type ConsentAction = keyof typeof CONSENT_ACTIONS;

const recordInput = z
  .object({
    phone: z.string().trim().min(1).max(40),
    channels: z
      .array(z.enum(MESSAGE_CHANNELS))
      .min(1)
      .max(MESSAGE_CHANNELS.length)
      .refine((l) => new Set(l).size === l.length, { message: 'every channel once' }),
    action: z.enum(Object.keys(CONSENT_ACTIONS) as [ConsentAction, ...ConsentAction[]]),
  })
  .strict();

/** Records a customer's stop or start that he asked the team for (`messages.consent.write`; audited). */
export async function recordConsentByStaff(deps: MessagesDeps, who: Who, input: unknown): Promise<{ recorded: number; screen: ConsentScreen }> {
  await allow(deps, who, 'messages.consent.write');
  const d = parse(recordInput, input, 'consent answer');
  const phone = phoneInput(d.phone);
  const a = CONSENT_ACTIONS[d.action];
  const customerId = await customerOf(deps.db, who.storeId, phone);
  const recorded = await recordConsentChange(deps.db, who.storeId, { phone, customerId, channels: d.channels, scope: a.scope, granted: a.granted, source: CONSENT_SOURCES.staff, recordedById: who.actor.staffUserId ?? null }, nowOf(deps));
  await logChange(deps.db, who, { action: 'messages.consent.record', entityType: 'ConsentRecord', entityId: customerId ?? phone, before: null, after: { action: d.action, channels: d.channels, phone } });
  return { recorded, screen: await consentScreen(deps, who, { phone }) };
}
