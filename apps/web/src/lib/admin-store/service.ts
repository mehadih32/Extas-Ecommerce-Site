// S18 · PR 383 — SET-01 Settings › Store details, the legal numbers (docs/BACKEND-ARCHITECTURE.md §5.13; Blueprint F2
// q27): the registered business name, the trade licence, the DBID and the VAT BIN of the shop the admin runs (owner
// data: typed in here, kept in the database, never in Git; PR 509). Each is printed by the shop only when it is set
// (footer, invoice, help page); a filler value ("[your DBID number]", "TBD", "xxx") is refused here and dropped where
// the shop reads it (@extas/settings placeholder.ts). The page also says which numbers are still missing before go-live.
// Seeing needs `settings.read`, saving `settings.write` (checked here again).
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { looksLikePlaceholder, registry, storeTarget } from '@extas/settings';
import type { AppResolver } from '../settings';

export interface StoreDeps {
  db: PrismaClient;
  resolver: AppResolver;
}
export interface StoreWho {
  actor: Actor;
  ctx: RequestContext;
}

/** The legal card: field → setting. */
export const LEGAL_FIELDS = {
  registeredName: 'legal.registeredName',
  tradeLicence: 'legal.tradeLicence',
  dbid: 'legal.dbid',
  bin: 'legal.bin',
} as const;
export type LegalField = keyof typeof LEGAL_FIELDS;
export const LEGAL_FIELD_IDS = Object.keys(LEGAL_FIELDS) as LegalField[];

/** The longest value a field takes, from its setting's own schema (a nullable text). */
export function legalMaxLength(f: LegalField): number {
  const schema = registry[LEGAL_FIELDS[f]].schema as unknown as { unwrap(): { maxLength: number | null } };
  return schema.unwrap().maxLength ?? Number.MAX_SAFE_INTEGER;
}

export interface LegalCard {
  key: 'legal';
  value: Record<LegalField, string>;
  version: string;
}

export interface StoreView {
  cards: { legal: LegalCard };
  /** The numbers not set yet (needed before go-live). */
  missing: LegalField[];
}

export class StorePageError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE' | 'PLACEHOLDER',
    readonly status: number,
    readonly details: string[] = [],
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
export const isStorePageError = (e: unknown): e is StorePageError => e instanceof StorePageError;

const S = MOTHER_STORE_ID;
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

async function legalCard(deps: StoreDeps): Promise<LegalCard> {
  const vals = await Promise.all(LEGAL_FIELD_IDS.map((f) => deps.resolver.value(LEGAL_FIELDS[f], { storeId: S })));
  const value = Object.fromEntries(LEGAL_FIELD_IDS.map((f, i) => [f, vals[i] ?? ''])) as Record<LegalField, string>;
  return { key: 'legal', value, version: versionOf(value) };
}

/** The page's data (`settings.read`). */
export async function storeView(deps: StoreDeps, who: StoreWho): Promise<StoreView> {
  await requirePermission(deps.db, who.actor, 'settings.read', { storeId: S });
  const legal = await legalCard(deps);
  return { cards: { legal }, missing: LEGAL_FIELD_IDS.filter((f) => !legal.value[f]) };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Saves the legal card whole (`settings.write`); an empty field clears its number; a filler value is refused. */
export async function saveLegalCard(deps: StoreDeps, who: StoreWho, input: unknown): Promise<StoreView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || input.key !== 'legal' || !isObj(input.value)) throw new StorePageError('INVALID_INPUT', 400, ['key', 'value']);
  const sent = input.value;
  const unknownFields = Object.keys(sent).filter((k) => !(k in LEGAL_FIELDS));
  if (unknownFields.length) throw new StorePageError('INVALID_INPUT', 400, unknownFields);
  const before = await legalCard(deps);
  if (input.version !== undefined && input.version !== before.version) throw new StorePageError('STALE', 409, ['version'], { version: before.version });
  // The card shows an unset number as '' ; it stays null (unset) unless a value is sent.
  const next = Object.fromEntries(LEGAL_FIELD_IDS.map((f) => [f, before.value[f] || null])) as Record<LegalField, string | null>;
  for (const f of LEGAL_FIELD_IDS) {
    if (!(f in sent)) continue;
    const raw = sent[f];
    if (raw !== null && typeof raw !== 'string') throw new StorePageError('INVALID_INPUT', 400, [f]);
    next[f] = raw === null || !raw.trim() ? null : raw.trim();
  }
  const fillers = LEGAL_FIELD_IDS.filter((f) => next[f] !== null && looksLikePlaceholder(next[f]));
  if (fillers.length) throw new StorePageError('PLACEHOLDER', 400, fillers);
  const bad: string[] = [];
  for (const f of LEGAL_FIELD_IDS) if (!registry[LEGAL_FIELDS[f]].schema.safeParse(next[f]).success) bad.push(f);
  if (bad.length) throw new StorePageError('INVALID_INPUT', 400, bad);
  const after = Object.fromEntries(LEGAL_FIELD_IDS.map((f) => [f, next[f] ?? ''])) as Record<LegalField, string>;
  if (versionOf(after) === before.version) return storeView(deps, who);
  const meta = { actorId: who.actor.staffUserId ?? null, reason: 'Settings › Store details' };
  for (const f of LEGAL_FIELD_IDS) {
    if (after[f] === before.value[f]) continue;
    await deps.resolver.set(LEGAL_FIELDS[f], next[f], storeTarget(S), meta);
  }
  // Owner data: the audit row names the fields that changed, never their values.
  await audit(deps.db, who.actor, { storeId: S, action: 'store.legal.save', entityType: 'Setting', entityId: 'legal', after: { changed: LEGAL_FIELD_IDS.filter((f) => after[f] !== before.value[f]) } }, who.ctx);
  return storeView(deps, who);
}
