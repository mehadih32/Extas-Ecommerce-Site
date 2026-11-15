// S18 · PR 383 — SET-01 Settings › Store details (docs/BACKEND-ARCHITECTURE.md §5.13; Blueprint F2 q27): the registered
// business name, the trade licence, the DBID and the VAT BIN of the shop the admin runs (owner data: typed in here, kept in
// the database, never in Git; PR 509). Each is printed by the shop only when it is set (footer, invoice, help page); a
// filler value ("[your DBID number]", "TBD", "xxx") is refused here and dropped where the shop reads it (@extas/settings
// placeholder.ts). The page also says which numbers are still missing before go-live.
// PR 789 (prototype v5 parity) — the page is the prototype's nine cards (cards.ts): each box edits a setting of its own
// (name, phone, e-mail, address, social links, legal numbers, order prefix) or one field of `store.details`. A card is saved
// whole, with its version; the audit row names the boxes that changed, never their values.
// Seeing needs `settings.read`, saving `settings.write` (checked here again).
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { looksLikePlaceholder, registry, storeDetailsSchema, storeTarget, STORE_DETAILS_DEFAULT, type Key, type StoreDetails } from '@extas/settings';
import type { AppResolver } from '../settings';
import { allBoxes, LEGAL_BOXES, STORE_CARDS, STORE_CARD_IDS, type StoreBox, type StoreCardId } from './cards';

export interface StoreDeps {
  db: PrismaClient;
  resolver: AppResolver;
}
export interface StoreWho {
  actor: Actor;
  ctx: RequestContext;
}

/** The four numbers the shop prints only when set (the "needed before go-live" list). */
export const LEGAL_FIELD_IDS = [...LEGAL_BOXES];
export type LegalField = (typeof LEGAL_BOXES)[number];
const LEGAL_KEYS: Record<LegalField, Key> = { registeredName: 'legal.registeredName', tradeLicence: 'legal.tradeLicence', dbid: 'legal.dbid', bin: 'legal.bin' };

/** The longest value a text box takes, from its setting's own schema (a nullable text). */
export function legalMaxLength(f: LegalField): number {
  const schema = registry[LEGAL_KEYS[f]].schema as unknown as { unwrap(): { maxLength: number | null } };
  return schema.unwrap().maxLength ?? Number.MAX_SAFE_INTEGER;
}

/** The longest value a plain text box takes (`undefined` when its setting has no limit of its own). */
export function boxMaxLength(box: StoreBox): number {
  if (box.key) {
    try {
      const s = registry[box.key].schema as unknown as { unwrap?: () => { maxLength?: number | null }; maxLength?: number | null };
      const m = s.unwrap ? s.unwrap().maxLength : s.maxLength;
      if (typeof m === 'number') return m;
    } catch {
      /* a schema without a text limit */
    }
    return 300;
  }
  return 300;
}

export type CardValue = Record<string, unknown>;
export interface StoreCard {
  key: StoreCardId;
  value: CardValue;
  version: string;
}

export interface StoreView {
  cards: Record<StoreCardId, StoreCard>;
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
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

interface Raw {
  keyed: Map<Key, unknown>;
  details: StoreDetails;
}

async function readRaw(deps: StoreDeps): Promise<Raw> {
  const keys = [...new Set(allBoxes().flatMap((x) => (x.box.key ? [x.box.key] : [])))];
  const vals = await Promise.all(keys.map((k) => deps.resolver.value(k, { storeId: S })));
  const details = (await deps.resolver.value('store.details', { storeId: S })) ?? STORE_DETAILS_DEFAULT;
  return { keyed: new Map(keys.map((k, i) => [k, vals[i]])), details: { ...STORE_DETAILS_DEFAULT, ...details } };
}

function boxValue(raw: Raw, box: StoreBox): unknown {
  if (box.d) return raw.details[box.d];
  const v = raw.keyed.get(box.key as Key);
  if (box.kind === 'pair') return isObj(v) ? { en: String(v.en ?? ''), bn: String(v.bn ?? '') } : null;
  return v ?? '';
}

function cardOf(raw: Raw, id: StoreCardId): StoreCard {
  const value = Object.fromEntries(STORE_CARDS[id].map((b) => [b.id, boxValue(raw, b)]));
  return { key: id, value, version: versionOf(value) };
}

function viewOf(raw: Raw): StoreView {
  const cards = Object.fromEntries(STORE_CARD_IDS.map((id) => [id, cardOf(raw, id)])) as Record<StoreCardId, StoreCard>;
  const missing = LEGAL_BOXES.filter((f) => !String(boxValue(raw, allBoxes().find((x) => x.box.id === f)!.box) ?? '').trim());
  return { cards, missing };
}

/** The page's data (`settings.read`). */
export async function storeView(deps: StoreDeps, who: StoreWho): Promise<StoreView> {
  await requirePermission(deps.db, who.actor, 'settings.read', { storeId: S });
  return viewOf(await readRaw(deps));
}

/** What a box's setting stores for a value the card sent (an empty text clears it: null). */
function stored(box: StoreBox, v: unknown): unknown {
  if (box.kind === 'pair') {
    if (v === null) return null;
    if (!isObj(v) || typeof v.en !== 'string' || typeof v.bn !== 'string') return undefined;
    return v.en.trim() || v.bn.trim() ? { en: v.en.trim(), bn: v.bn.trim() } : null;
  }
  if (box.kind === 'switch') return typeof v === 'boolean' ? v : undefined;
  if (box.kind === 'number') {
    const n = v === '' || v === null ? 0 : v;
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : undefined;
  }
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return box.d ? t : t || null;
}

/** Saves one card whole (`settings.write`); an empty box clears its value; a filler stand-in for a legal number is refused. */
export async function saveStoreCard(deps: StoreDeps, who: StoreWho, input: unknown): Promise<StoreView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || typeof input.key !== 'string' || !isObj(input.value)) throw new StorePageError('INVALID_INPUT', 400, ['key', 'value']);
  const id = input.key as StoreCardId;
  if (!STORE_CARD_IDS.includes(id)) throw new StorePageError('INVALID_INPUT', 400, ['key']);
  const boxes = STORE_CARDS[id];
  const sent = input.value;
  const unknownFields = Object.keys(sent).filter((k) => !boxes.some((b) => b.id === k));
  if (unknownFields.length) throw new StorePageError('INVALID_INPUT', 400, unknownFields);
  const raw = await readRaw(deps);
  const before = cardOf(raw, id);
  if (input.version !== undefined && input.version !== before.version) throw new StorePageError('STALE', 409, ['version'], { version: before.version });

  const next = new Map<string, unknown>();
  const bad: string[] = [];
  for (const b of boxes) {
    if (!(b.id in sent)) continue;
    const s = stored(b, sent[b.id]);
    if (s === undefined) {
      bad.push(b.id);
      continue;
    }
    next.set(b.id, s);
  }
  if (bad.length) throw new StorePageError('INVALID_INPUT', 400, bad);
  const fillers = boxes.filter((b) => (LEGAL_BOXES as readonly string[]).includes(b.id) && typeof next.get(b.id) === 'string' && looksLikePlaceholder(next.get(b.id) as string)).map((b) => b.id);
  if (fillers.length) throw new StorePageError('PLACEHOLDER', 400, fillers);

  // the details object is checked whole; each setting of its own against its own schema
  const details: StoreDetails = { ...raw.details };
  const keyedNext: { box: StoreBox; value: unknown }[] = [];
  for (const b of boxes) {
    if (!next.has(b.id)) continue;
    const v = next.get(b.id);
    if (b.d) (details as Record<string, unknown>)[b.d] = v;
    else {
      if (!registry[b.key as Key].schema.safeParse(v).success) bad.push(b.id);
      else keyedNext.push({ box: b, value: v });
    }
  }
  if (!storeDetailsSchema.safeParse(details).success) {
    const issues = storeDetailsSchema.safeParse(details);
    const paths = issues.success ? [] : issues.error.issues.map((i) => String(i.path[0] ?? ''));
    for (const b of boxes) if (b.d && paths.includes(b.d)) bad.push(b.id);
    if (!bad.length) bad.push('card');
  }
  if (bad.length) throw new StorePageError('INVALID_INPUT', 400, [...new Set(bad)]);

  const meta = { actorId: who.actor.staffUserId ?? null, reason: 'Settings › Store details' };
  const changed: string[] = [];
  for (const { box, value } of keyedNext) {
    const was = boxValue(raw, box);
    const asWas = box.kind === 'pair' ? was : was === '' ? null : was;
    if (JSON.stringify(asWas) === JSON.stringify(value)) continue;
    await deps.resolver.set(box.key as Key, value as never, storeTarget(S), meta);
    changed.push(box.id);
  }
  if (JSON.stringify(details) !== JSON.stringify(raw.details)) {
    await deps.resolver.set('store.details', details, storeTarget(S), meta);
    for (const b of boxes) if (b.d && JSON.stringify(raw.details[b.d]) !== JSON.stringify(details[b.d])) changed.push(b.id);
  }
  if (changed.length) {
    // Owner data: the audit row names the boxes that changed, never their values.
    await audit(deps.db, who.actor, { storeId: S, action: id === 'legal' ? 'store.legal.save' : `store.${id}.save`, entityType: 'Setting', entityId: id, after: { changed } }, who.ctx);
  }
  return storeView(deps, who);
}

/** @deprecated kept for the callers of PR 383: the legal numbers are saved with the same card save. */
export const saveLegalCard = saveStoreCard;
