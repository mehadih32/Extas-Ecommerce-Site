// PR 427 — identity resolution (Blueprint B4.5 last paragraph, B4.14 item 3): phone ↔ PSID ↔ customer, one person
// across channels. Off as it ships (`support.identity`).
//
// When a message arrives (`resolveIdentity`, inside receiveMessage's transaction):
//   1. the number — the one the channel gave, else WhatsApp's own id (it is the number), else (`fromText`) the first
//      Bangladeshi mobile number typed in the chat's words; kept on the contact as stored (+8801…), never overwriting
//      a number the contact already has;
//   2. the customer — the customer with that number (or that WhatsApp number), followed to the profile it was merged
//      into (PR 284); the contact and its chats without a customer are linked to it;
//   3. one person (`autoLink`) — another channel's contact with the same number or the same customer joins this
//      person: `mergedIntoId` always names the person's first contact. Two different customers are never joined, and a
//      person with a chat set by hand is never folded into another automatically.
// Every step is a line in the who-did-what log (by the system, without the number itself).
//
// What an employee does (`support.identity`, audited, a line in the log, the chat's version checked): set the chat's
// number (and so its customer), unlink its customer, or say "not the same person". Each sets the chat by hand
// (`identityFixedAt`): automatic matching never changes it again. Nothing here sends a message or changes an order.
import type { Prisma } from '@extas/db/client';
import type { SupportIdentitySettings } from '@extas/settings';
import { z } from 'zod';
import { allow, logChange, nowOf, parse, SupportError, TX, type Db, type SupportDeps, type Who } from './context';
import { e164Of, phonesInText } from './identity-pure';

type Tx = Prisma.TransactionClient;

/** One change to who-is-who at a time per store, so two arrivals never fold two people into each other at once. */
const lockPeople = (tx: Tx, storeId: number) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`support-identity:${storeId}`}, 0))`;

/** How many hops a merged customer profile is followed (PR 284 keeps them flat; this is a guard). */
const MAX_HOPS = 5;
/** The most other contacts one arrival looks at for the same person. */
const MAX_OTHERS = 50;
/** The most of the person's other chats a conversation lists. */
export const PERSON_CHATS_MAX = 20;

/** The customer with this number (stored +880… or as digits, or as their WhatsApp number), followed past merges. */
export async function customerIdByPhone(db: Db, storeId: number, e164: string): Promise<string | null> {
  const digits = `0${e164.slice(4)}`;
  const forms = [e164, digits];
  const pick = { id: true, mergedIntoId: true } as const;
  let c =
    (await db.customer.findFirst({ where: { storeId, phone: { in: forms }, erasedAt: null }, select: pick })) ??
    (await db.customer.findFirst({ where: { storeId, whatsappNumber: { in: forms }, erasedAt: null }, orderBy: { createdAt: 'asc' }, select: pick }));
  for (let i = 0; c?.mergedIntoId && i < MAX_HOPS; i++) {
    const next = await db.customer.findFirst({ where: { id: c.mergedIntoId, storeId, erasedAt: null }, select: pick });
    if (!next) break;
    c = next;
  }
  return c?.id ?? null;
}

export interface IdentityOutcome {
  /** Where a new number came from. */
  phone: 'channel' | 'text' | null;
  customerLinked: boolean;
  /** Other contacts joined to this person. */
  joined: number;
}

const NOTHING: IdentityOutcome = { phone: null, customerLinked: false, joined: 0 };

interface Arrival {
  storeId: number;
  contactId: string;
  conversationId: string;
  text: string | null;
  /** The log's time for these lines (just after the message's own line). */
  at: Date;
  rules: SupportIdentitySettings;
}

type ContactRow = { id: string; mergedIntoId: string | null; customerId: string | null; createdAt: Date; identityFixedAt: Date | null };
const CONTACT_PICK = { id: true, mergedIntoId: true, customerId: true, createdAt: true, identityFixedAt: true } as const;

/** Every contact of the people whose first contact is one of `roots`. */
async function peopleOf(tx: Db, storeId: number, roots: string[]): Promise<Map<string, ContactRow[]>> {
  const rows = await tx.supportContact.findMany({ where: { storeId, OR: [{ id: { in: roots } }, { mergedIntoId: { in: roots } }] }, select: CONTACT_PICK });
  const people = new Map<string, ContactRow[]>(roots.map((r) => [r, []]));
  for (const r of rows) people.get(r.mergedIntoId ?? r.id)?.push(r);
  return people;
}

const oneCustomer = (rows: ContactRow[]): Set<string> => new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x));

/** Links the contact's chats that have no customer yet. */
const linkChats = (tx: Tx, storeId: number, contactIds: string[], customerId: string) =>
  tx.conversation.updateMany({ where: { storeId, contactId: { in: contactIds }, customerId: null }, data: { customerId } });

/** Works out who wrote a message that just arrived (inside receiveMessage's transaction). Does nothing when off. */
export async function resolveIdentity(tx: Tx, a: Arrival): Promise<IdentityOutcome> {
  if (!a.rules.enabled) return NOTHING;
  const c = await tx.supportContact.findUniqueOrThrow({ where: { id: a.contactId } });
  if (c.identityFixedAt) return NOTHING;
  // each line a millisecond after the one before, so the log reads in the order things happened
  let seq = 0;
  const line = (kind: string, data: Record<string, unknown>) =>
    tx.conversationEvent.create({ data: { storeId: a.storeId, conversationId: a.conversationId, kind, actorType: 'SYSTEM', actorName: null, data: data as Prisma.InputJsonValue, createdAt: new Date(a.at.getTime() + seq++) } });
  const out: IdentityOutcome = { ...NOTHING };

  // 1. the number
  let phone = e164Of(c.phone);
  if (!c.phone) {
    const fromChannel = c.channelKind === 'whatsapp' ? e164Of(c.externalId) : null;
    const found = fromChannel ?? (a.rules.fromText ? (phonesInText(a.text, 1)[0] ?? null) : null);
    if (found) {
      phone = found;
      out.phone = fromChannel ? 'channel' : 'text';
      await tx.supportContact.update({ where: { id: c.id }, data: { phone } });
      await line('IDENTITY_PHONE', { via: out.phone });
    }
  }

  // 2. the customer
  let customerId = c.customerId;
  if (phone && !customerId) {
    customerId = await customerIdByPhone(tx, a.storeId, phone);
    if (customerId) {
      await tx.supportContact.update({ where: { id: c.id }, data: { customerId } });
      await linkChats(tx, a.storeId, [c.id], customerId);
      out.customerLinked = true;
      await line('IDENTITY_CUSTOMER', { via: 'phone' });
    }
  }

  // 3. one person across channels
  if (!a.rules.autoLink || (!phone && !customerId)) return out;
  await lockPeople(tx, a.storeId);
  const match: Prisma.SupportContactWhereInput[] = [...(phone ? [{ phone }] : []), ...(customerId ? [{ customerId }] : [])];
  const others = await tx.supportContact.findMany({ where: { storeId: a.storeId, id: { not: c.id }, identityFixedAt: null, OR: match }, select: { ...CONTACT_PICK, phone: true }, take: MAX_OTHERS });
  const mine = c.mergedIntoId ?? c.id;
  const roots = [...new Set([mine, ...others.map((o) => o.mergedIntoId ?? o.id)])];
  if (roots.length < 2) return out;
  const people = await peopleOf(tx, a.storeId, roots);
  const firstOf = (r: string) => people.get(r)?.find((x) => x.id === r)?.createdAt.getTime() ?? Number.MAX_SAFE_INTEGER;
  // only people who could be this one (no second customer) are looked at; the one whose first contact came first stays
  const own = oneCustomer(people.get(mine) ?? []);
  const fits = roots.filter((r) => r === mine || new Set([...own, ...oneCustomer(people.get(r) ?? [])]).size <= 1);
  const [keep, ...rest] = fits.sort((x, y) => firstOf(x) - firstOf(y) || (x < y ? -1 : 1));
  const kept = [...(people.get(keep!) ?? [])];
  const customers = oneCustomer(kept);
  let joined = 0;
  for (const r of rest) {
    const group = people.get(r) ?? [];
    // a person with a chat set by hand, or with another customer, is never joined automatically
    if (!group.length || group.some((x) => x.identityFixedAt)) continue;
    const theirs = oneCustomer(group);
    if (new Set([...customers, ...theirs]).size > 1) continue;
    await tx.supportContact.updateMany({ where: { storeId: a.storeId, id: { in: group.map((x) => x.id) } }, data: { mergedIntoId: keep! } });
    for (const id of theirs) customers.add(id);
    kept.push(...group);
    joined += group.length;
  }
  if (!joined) return out;
  // the person's one customer reaches every contact and chat of theirs that has none
  const [only] = [...customers];
  if (only && customers.size === 1) {
    const bare = kept.filter((x) => !x.customerId && !x.identityFixedAt).map((x) => x.id);
    if (bare.length) await tx.supportContact.updateMany({ where: { storeId: a.storeId, id: { in: bare } }, data: { customerId: only } });
    await linkChats(
      tx,
      a.storeId,
      kept.filter((x) => !x.identityFixedAt).map((x) => x.id),
      only,
    );
  }
  out.joined = joined;
  await line('IDENTITY_MERGED', { via: phone && others.some((o) => o.phone === phone) ? 'phone' : 'customer', contacts: joined });
  return out;
}

// ------------------------------------------------------------------------------------------------------------ person

export interface PersonChat {
  id: string;
  refCode: string;
  status: string;
  channel: { kind: string; name: string };
  lastMessageAt: Date | null;
}

export interface Person {
  /** The same person's other chats (other channels or earlier chats), latest first. */
  chats: PersonChat[];
  /** How many contacts (channel accounts) the person has, this one included. */
  contacts: number;
  /** An employee set this chat's person by hand: automatic matching leaves it alone. */
  fixed: boolean;
}

/** The person behind a conversation's contact: their other chats. */
export async function personOf(db: Db, storeId: number, contactId: string, conversationId: string): Promise<Person> {
  const c = await db.supportContact.findFirst({ where: { id: contactId, storeId }, select: { id: true, mergedIntoId: true, identityFixedAt: true } });
  if (!c) return { chats: [], contacts: 0, fixed: false };
  const root = c.mergedIntoId ?? c.id;
  const members = await db.supportContact.findMany({ where: { storeId, OR: [{ id: root }, { mergedIntoId: root }] }, select: { id: true } });
  const ids = [...new Set([c.id, ...members.map((m) => m.id)])];
  const chats = await db.conversation.findMany({
    where: { storeId, contactId: { in: ids }, id: { not: conversationId } },
    orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: PERSON_CHATS_MAX,
    select: { id: true, refCode: true, status: true, lastMessageAt: true, channel: { select: { kind: true, name: true } } },
  });
  return { chats, contacts: ids.length, fixed: !!c.identityFixedAt };
}

// ------------------------------------------------------------------------------------------------------------ by hand

const byHandInput = z.object({ conversationId: z.uuid(), version: z.string().max(40).optional() }).strict();
export const setPhoneInput = byHandInput.extend({ phone: z.string().trim().min(1).max(40) }).strict();

export interface IdentityChange {
  conversationId: string;
  customerId: string | null;
  /** The chat's new version. */
  version: string;
}

/** The conversation's contact, locked; a stale version is refused. */
async function lockContact(tx: Tx, who: Who, conversationId: string, version?: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Conversation" WHERE "id" = ${conversationId}::uuid AND "storeId" = ${who.storeId} FOR UPDATE`;
  if (!rows.length) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  const conv = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { id: true, updatedAt: true, customerId: true, contactId: true } });
  if (version !== undefined && version !== conv.updatedAt.toISOString()) throw new SupportError('STALE', 'the conversation changed; read it again', ['version'], { version: conv.updatedAt.toISOString() });
  await lockPeople(tx, who.storeId);
  await tx.$executeRaw`SELECT 1 FROM "SupportContact" WHERE "id" = ${conv.contactId}::uuid FOR UPDATE`;
  const contact = await tx.supportContact.findUniqueOrThrow({ where: { id: conv.contactId } });
  return { conv, contact };
}

async function staffLine(tx: Tx, who: Who, conversationId: string, kind: string, data: Record<string, unknown>, at: Date): Promise<void> {
  const name = who.actor.staffUserId ? ((await tx.staffUser.findUnique({ where: { id: who.actor.staffUserId }, select: { displayName: true } }))?.displayName ?? null) : null;
  await tx.conversationEvent.create({ data: { storeId: who.storeId, conversationId, kind, actorType: 'STAFF', actorStaffId: who.actor.staffUserId, actorName: name, data: data as Prisma.InputJsonValue, createdAt: at } });
}

/** Touches the conversation so its version moves on; answers the new version. */
async function touch(tx: Tx, conversationId: string, data: Prisma.ConversationUpdateInput = {}): Promise<{ version: string; customerId: string | null }> {
  const c = await tx.conversation.update({ where: { id: conversationId }, data: { ...data, updatedAt: new Date() }, select: { updatedAt: true, customerId: true } });
  return { version: c.updatedAt.toISOString(), customerId: c.customerId };
}

/**
 * Sets the chat's number by hand (`support.identity`): kept as stored (+8801…), and the customer with that number linked
 * to this chat (a chat already linked to another customer moves to this one). The chat is then set by hand.
 */
export async function setContactPhone(deps: SupportDeps, who: Who, input: unknown): Promise<IdentityChange> {
  await allow(deps, who, 'support.identity');
  const d = parse(setPhoneInput, input, 'number');
  const phone = e164Of(d.phone);
  if (!phone) throw new SupportError('INVALID_INPUT', 'not a Bangladeshi mobile number', ['phone']);
  const at = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const { conv, contact } = await lockContact(tx, who, d.conversationId, d.version);
    const customerId = (await customerIdByPhone(tx, who.storeId, phone)) ?? contact.customerId;
    await tx.supportContact.update({ where: { id: contact.id }, data: { phone, customerId, identityFixedAt: at } });
    if (customerId && customerId !== contact.customerId) {
      await tx.conversation.updateMany({ where: { storeId: who.storeId, contactId: contact.id, OR: [{ customerId: null }, ...(contact.customerId ? [{ customerId: contact.customerId }] : [])] }, data: { customerId } });
    }
    const after = await touch(tx, conv.id);
    await staffLine(tx, who, conv.id, 'IDENTITY_PHONE', { byHand: true }, at);
    if (customerId && customerId !== contact.customerId) await staffLine(tx, who, conv.id, 'IDENTITY_CUSTOMER', { byHand: true }, new Date(at.getTime() + 1));
    // the number itself stays out of the audit row (it is the customer's, and erasable)
    await logChange(tx, who, { action: 'support.identity.phone', entityType: 'SupportContact', entityId: contact.id, before: { hadPhone: !!contact.phone, customerId: contact.customerId }, after: { hadPhone: true, customerId } });
    return { conversationId: conv.id, customerId: after.customerId, version: after.version };
  }, TX);
}

/** This chat is not that customer (`support.identity`): the link goes from the contact and its chats that had it. */
export async function unlinkContactCustomer(deps: SupportDeps, who: Who, input: unknown): Promise<IdentityChange> {
  await allow(deps, who, 'support.identity');
  const d = parse(byHandInput, input, 'unlink');
  const at = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const { conv, contact } = await lockContact(tx, who, d.conversationId, d.version);
    const old = contact.customerId ?? conv.customerId;
    if (!old) throw new SupportError('NOT_LINKED', 'this chat has no customer', ['customer']);
    await tx.supportContact.update({ where: { id: contact.id }, data: { customerId: null, identityFixedAt: at } });
    await tx.conversation.updateMany({ where: { storeId: who.storeId, contactId: contact.id, customerId: old }, data: { customerId: null } });
    const after = await touch(tx, conv.id);
    await staffLine(tx, who, conv.id, 'IDENTITY_UNLINKED', {}, at);
    await logChange(tx, who, { action: 'support.identity.unlink', entityType: 'SupportContact', entityId: contact.id, before: { customerId: old }, after: { customerId: null } });
    return { conversationId: conv.id, customerId: after.customerId, version: after.version };
  }, TX);
}

/**
 * "Not the same person" (`support.identity`): this chat's contact leaves the person it was put with. When it was the
 * person's first contact, the next one in time becomes the first for the others. Its customer link stays (unlink it
 * separately when that is wrong too).
 */
export async function splitContact(deps: SupportDeps, who: Who, input: unknown): Promise<IdentityChange> {
  await allow(deps, who, 'support.identity');
  const d = parse(byHandInput, input, 'split');
  const at = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const { conv, contact } = await lockContact(tx, who, d.conversationId, d.version);
    const members = contact.mergedIntoId ? [] : await tx.supportContact.findMany({ where: { storeId: who.storeId, mergedIntoId: contact.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
    if (!contact.mergedIntoId && !members.length) throw new SupportError('NOT_LINKED', 'this chat is not put with anyone', ['person']);
    if (members.length) {
      const [first, ...others] = members;
      await tx.supportContact.update({ where: { id: first!.id }, data: { mergedIntoId: null } });
      if (others.length) await tx.supportContact.updateMany({ where: { storeId: who.storeId, id: { in: others.map((o) => o.id) } }, data: { mergedIntoId: first!.id } });
    }
    await tx.supportContact.update({ where: { id: contact.id }, data: { mergedIntoId: null, identityFixedAt: at } });
    const after = await touch(tx, conv.id);
    await staffLine(tx, who, conv.id, 'IDENTITY_SPLIT', {}, at);
    await logChange(tx, who, { action: 'support.identity.split', entityType: 'SupportContact', entityId: contact.id, before: { mergedIntoId: contact.mergedIntoId, others: members.length }, after: { mergedIntoId: null } });
    return { conversationId: conv.id, customerId: after.customerId, version: after.version };
  }, TX);
}
