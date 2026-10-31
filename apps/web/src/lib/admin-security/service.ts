// S18 · PR 380 — SET-04d Settings › Sign-in & security (docs/BACKEND-ARCHITECTURE.md §5.13): the page's cards, each
// saved whole with its version, and what the page shows beside them (how many staff use 2FA, the admin address list
// and the address the page is opened from, the latest security events). Reading needs `security.read`, saving
// `security.write` (checked here again, whatever the page showed). Every save goes through the settings resolver
// (validated, a SettingChange row) and writes an audit row. The address list is refused when it is on and does not
// hold the address it is saved from (no one locks himself out).
import { createHash } from 'node:crypto';
import { addressOnList, audit, AuthError, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { INSTALLATION, registry, type Key, type Value } from '@extas/settings';
import type { AppResolver } from '../settings';
import { addressTag } from '../security/edge-gate';
import { ALLOWLIST_BREAK_GLASS_ENV } from './access';
import { deviceName } from './device';

/** One field of a card: a whole setting, or one part of a setting whose value is an object. */
interface FieldRef {
  key: Key;
  sub?: string;
}

/** The cards and their fields (field name → setting). */
export const SECURITY_CARDS = {
  signIn: {
    twoFactor: { key: 'security.staffTwoFactorRequired' },
    idleMinutes: { key: 'security.staffSessionIdleMinutes' },
    maxHours: { key: 'security.staffSessionMaxHours' },
    maxAttempts: { key: 'security.loginMaxAttempts' },
    lockoutMinutes: { key: 'security.loginLockoutMinutes' },
    loginAlerts: { key: 'security.staffLoginAlerts' },
    noteDays: { key: 'security.newLoginNoteDays' },
  },
  allowlist: {
    enabled: { key: 'security.adminIpAllowlist', sub: 'enabled' },
    entries: { key: 'security.adminIpAllowlist', sub: 'entries' },
  },
  protection: {
    csp: { key: 'security.csp.mode' },
    rate: { key: 'security.rateLimit.mode' },
    bot: { key: 'security.bot.mode' },
  },
  limits: {
    signIn: { key: 'security.rateLimit.perMinute', sub: 'signIn' },
    checkout: { key: 'security.rateLimit.perMinute', sub: 'checkout' },
    shopWrite: { key: 'security.rateLimit.perMinute', sub: 'shopWrite' },
    report: { key: 'security.rateLimit.perMinute', sub: 'report' },
    webhook: { key: 'security.rateLimit.perMinute', sub: 'webhook' },
  },
  bot: {
    checkoutSeconds: { key: 'security.bot.minFillSeconds', sub: 'checkout' },
    signInSeconds: { key: 'security.bot.minFillSeconds', sub: 'signIn' },
    adminSignInSeconds: { key: 'security.bot.minFillSeconds', sub: 'adminSignIn' },
    noteScore: { key: 'security.bot.noteScore' },
  },
} as const satisfies Record<string, Record<string, FieldRef>>;

export type SecurityCardId = keyof typeof SECURITY_CARDS;
export const SECURITY_CARD_IDS = Object.keys(SECURITY_CARDS) as SecurityCardId[];

export interface SecurityCard {
  key: SecurityCardId;
  value: Record<string, unknown>;
  byDefault: Record<string, unknown>;
  version: string;
}

export interface SecurityEventRow {
  id: string;
  kind: string;
  severity: string;
  at: string;
  details: Record<string, unknown>;
}

export interface SecurityView {
  cards: Record<SecurityCardId, SecurityCard>;
  staff: { active: number; twoFactor: number };
  /** The address this page was opened from (to add to the list), and whether it is on the list. */
  address: { ip: string | null; onList: boolean };
  /** The server's break-glass switch is set: the list does not apply now. */
  breakGlass: boolean;
  events: SecurityEventRow[];
}

export interface SecurityDeps {
  db: PrismaClient;
  resolver: AppResolver;
  env?: Record<string, string | undefined>;
}

export interface SecurityWho {
  actor: Actor;
  ctx: RequestContext;
}

export class SecurityPageError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE' | 'ADDRESS_NOT_ON_LIST',
    readonly status: number,
    readonly details: string[] = [],
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

const keysOf = (card: SecurityCardId): Key[] => [...new Set(Object.values(SECURITY_CARDS[card] as Record<string, FieldRef>).map((f) => f.key))];

function pick(card: SecurityCardId, read: (k: Key) => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, f] of Object.entries(SECURITY_CARDS[card] as Record<string, FieldRef>)) {
    const v = read(f.key);
    out[name] = f.sub ? (v as Record<string, unknown>)[f.sub] : v;
  }
  return out;
}

async function cardOf(deps: SecurityDeps, card: SecurityCardId): Promise<SecurityCard> {
  const keys = keysOf(card);
  const values = new Map<Key, unknown>(await Promise.all(keys.map(async (k) => [k, await deps.resolver.value(k)] as const)));
  const value = pick(card, (k) => values.get(k));
  return { key: card, value, byDefault: pick(card, (k) => registry[k].default), version: versionOf(value) };
}

async function cardsOf(deps: SecurityDeps): Promise<Record<SecurityCardId, SecurityCard>> {
  const all = await Promise.all(SECURITY_CARD_IDS.map((c) => cardOf(deps, c)));
  return Object.fromEntries(all.map((c) => [c.key, c])) as Record<SecurityCardId, SecurityCard>;
}

/** The page's data (`security.read`). */
export async function securityView(deps: SecurityDeps, who: SecurityWho): Promise<SecurityView> {
  await requirePermission(deps.db, who.actor, 'security.read', { storeId: MOTHER_STORE_ID });
  const [cards, active, twoFactor, size] = await Promise.all([
    cardsOf(deps),
    deps.db.staffUser.count({ where: { status: 'ACTIVE' } }),
    deps.db.staffUser.count({ where: { status: 'ACTIVE', twoFactorEnabled: true } }),
    deps.resolver.value('security.eventsListSize'),
  ]);
  // Customer sign-ins (each one an event, used for the wrong-password pause) would bury the rest: they stay off this list.
  const rows = await deps.db.securityEvent.findMany({
    where: { NOT: { kind: { startsWith: 'customer.login.' } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: size,
    select: { id: true, kind: true, severity: true, createdAt: true, details: true },
  });
  const staffIds = [...new Set(rows.flatMap((r) => staffIdsOf(r.details)))];
  const names = new Map((staffIds.length ? await deps.db.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } }) : []).map((p) => [p.id, p.displayName]));
  const list = cards.allowlist.value as { entries: string[] };
  const ip = who.ctx.ip ?? null;
  return {
    cards,
    staff: { active, twoFactor },
    address: { ip, onList: addressOnList(ip, list.entries) },
    breakGlass: (deps.env ?? process.env)[ALLOWLIST_BREAK_GLASS_ENV] === '1',
    events: rows.map((r) => ({ id: r.id, kind: r.kind, severity: r.severity, at: r.createdAt.toISOString(), details: readableDetails(r.details, names) })),
  };
}

/**
 * Only the plain fields of an event's details (never a token or a hash; the auth package keeps none there). A full
 * internet address is shown as its short mark (`address`, the same mark the bot notes and rate limits use).
 */
export function safeDetails(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (/token|hash|secret|password/i.test(k)) continue;
    if (k === 'ip') {
      if (typeof x === 'string' && x) out.address = addressTag(x);
      continue;
    }
    if (x === null || ['string', 'number', 'boolean'].includes(typeof x)) out[k] = x;
    else if (Array.isArray(x) && x.every((y) => typeof y === 'string')) out[k] = x;
  }
  return out;
}

const STAFF_ID_FIELDS = ['staffUserId', 'by'] as const;

function staffIdsOf(v: unknown): string[] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  const o = v as Record<string, unknown>;
  return STAFF_ID_FIELDS.map((k) => o[k]).filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * The details as a person reads them: a staff member's name for `staffUserId` / `by` (`who`, `by`), a short device
 * name for the user agent (`device`), the address as its mark, and no customer id (the customer pages show the person).
 */
export function readableDetails(v: unknown, names: ReadonlyMap<string, string>): Record<string, unknown> {
  const plain = safeDetails(v);
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(plain)) {
    if (k === 'staffUserId') out.who = typeof x === 'string' ? (names.get(x) ?? '—') : '—';
    else if (k === 'by') out.by = typeof x === 'string' ? (names.get(x) ?? '—') : '—';
    else if (k === 'userAgent') out.device = deviceName(typeof x === 'string' ? x : null);
    else if (k === 'customerId') continue;
    else out[k] = x;
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Saves one card whole (`security.write`); a stale version is refused with the fresh one. */
export async function saveSecurityCard(deps: SecurityDeps, who: SecurityWho, input: unknown): Promise<SecurityView> {
  await requirePermission(deps.db, who.actor, 'security.write', { storeId: MOTHER_STORE_ID });
  if (!isObj(input) || typeof input.key !== 'string' || !(SECURITY_CARD_IDS as string[]).includes(input.key) || !isObj(input.value)) {
    throw new SecurityPageError('INVALID_INPUT', 400, ['key', 'value']);
  }
  const card = input.key as SecurityCardId;
  const fields = SECURITY_CARDS[card] as Record<string, FieldRef>;
  const sent = input.value;
  const unknownFields = Object.keys(sent).filter((k) => !(k in fields));
  if (unknownFields.length) throw new SecurityPageError('INVALID_INPUT', 400, unknownFields);
  const before = await cardOf(deps, card);
  if (input.version !== undefined && input.version !== before.version) throw new SecurityPageError('STALE', 409, ['version'], { version: before.version });

  // The new value of each setting: the old one with the card's fields put in.
  const next = new Map<Key, unknown>();
  for (const k of keysOf(card)) next.set(k, structuredClone(await deps.resolver.value(k)));
  for (const [name, f] of Object.entries(fields)) {
    if (!(name in sent)) continue;
    if (f.sub) (next.get(f.key) as Record<string, unknown>)[f.sub] = sent[name];
    else next.set(f.key, sent[name]);
  }
  for (const [k, v] of next) {
    const r = registry[k].schema.safeParse(v);
    if (!r.success) throw new SecurityPageError('INVALID_INPUT', 400, r.error.issues.map((i) => `${k}${i.path.length ? `.${i.path.join('.')}` : ''}: ${i.message}`));
    next.set(k, r.data);
  }
  if (card === 'allowlist') {
    const list = next.get('security.adminIpAllowlist') as { enabled: boolean; entries: string[] };
    if (list.enabled && !addressOnList(who.ctx.ip ?? null, list.entries)) throw new SecurityPageError('ADDRESS_NOT_ON_LIST', 400, [who.ctx.ip ?? '?']);
  }
  const after = pick(card, (k) => next.get(k));
  if (versionOf(after) === before.version) return securityView(deps, who);
  for (const [k, v] of next) {
    if (JSON.stringify(v) === JSON.stringify(await deps.resolver.value(k))) continue;
    await deps.resolver.set(k, v as Value<typeof k>, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'Settings › Sign-in & security' });
  }
  await audit(deps.db, who.actor, { action: 'security.settings.save', entityType: 'Setting', entityId: card, before: before.value, after }, who.ctx);
  return securityView(deps, who);
}

export const isSecurityPageError = (e: unknown): e is SecurityPageError => e instanceof SecurityPageError;
export { AuthError };
