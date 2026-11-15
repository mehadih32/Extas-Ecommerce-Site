// PR 740–744 — Website › Page settings, the server side (screens.ts says which keys each screen edits; describe.ts draws them
// from their own schemas). A screen is read with the version it was read at (a hash of its values), and saved whole:
// every value is checked against the setting's own schema (plus the shop-wide ones against the platform: a real currency
// code, language tag and time zone), a save over someone else's change answers STALE, only what changed is written, and
// the save is audited (`settings.pagesettings.save`, before and after, per key). Seeing needs the screen's read key,
// saving its write key (checked again here). Nothing here touches a price, an order or a customer.
import { createHash } from 'node:crypto';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { imageSources } from '@extas/media';
import { registry, storeTarget, type Key } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { AppResolver } from '../settings';
import { describeSchema, sameValue, type Node } from './describe';
import { isScreenId, keysOf, SCREENS, type ScreenDef, type ScreenId } from './screens';

const S = MOTHER_STORE_ID;

export interface PsDeps {
  db: PrismaClient;
  resolver: AppResolver;
}
export interface PsWho {
  actor: Actor;
  ctx: RequestContext;
}

export class PsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface FieldView {
  key: string;
  node: Node;
  value: unknown;
  def: unknown;
}
export interface SectionView {
  id: string;
  more: boolean;
  fields: FieldView[];
}
export interface Choices {
  products: { id: string; en: string; bn: string | null }[];
  collections: { slug: string; en: string; bn: string | null }[];
}
export interface PageSettingsView {
  screen: ScreenId;
  sections: SectionView[];
  version: string;
  choices: Choices;
  /** The picture each picked media id shows (null: its sizes are still being made). */
  media: Record<string, string | null>;
  /** What the platform knows, for the shop-wide boxes (a currency code, a language, a time zone). */
  lists: { currencies: string[]; locales: string[]; timeZones: string[] };
  /** The saved look as the reader sees it (the e-mail screen), as HTML; the page draws it, never this file. */
  preview: string | null;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);

const nodes = new Map<string, Node>();
function nodeOf(key: Key): Node {
  let n = nodes.get(key);
  if (!n) {
    n = describeSchema(registry[key].schema);
    nodes.set(key, n);
  }
  return n;
}

/** The platform's own lists for the shop-wide boxes (the ones a person is likely to need first). */
const CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'MYR', 'SGD', 'PKR', 'LKR', 'NPR']; // hardcode-ok: the suggestions of the currency box; any real ISO 4217 code is accepted
const LOCALES = ['bn-BD', 'en-BD', 'en-GB', 'en-US', 'en-IN', 'bn-IN']; // hardcode-ok: the suggestions of the language box; any real language tag is accepted

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

/** The platform checks for the shop-wide strings; `null` when fine. */
export function platformIssue(key: string, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    if (key === 'store.currency') {
      if (!/^[A-Z]{3}$/.test(value)) return 'a currency is three capital letters, like BDT';
      new Intl.NumberFormat('en', { style: 'currency', currency: value }).format(1);
    } else if (key === 'store.locale') {
      if (Intl.getCanonicalLocales(value).length !== 1 || Intl.NumberFormat.supportedLocalesOf(value).length === 0) return 'this language tag is not known';
    } else if (key === 'store.timeZone') {
      new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    }
  } catch {
    return 'this value is not known';
  }
  return null;
}

const at = (v: unknown, path: string[]): unknown => path.reduce<unknown>((o, p) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[p] : undefined), v);

async function mediaPreviews(deps: PsDeps, screen: ScreenDef, values: Record<string, unknown>): Promise<Record<string, string | null>> {
  const ids: string[] = [];
  for (const [id, w] of Object.entries(screen.widgets)) {
    if (w.kind !== 'media') continue;
    const [key, ...path] = id.split('/');
    const v = at(values[key!], path);
    if (typeof v === 'string') ids.push(v);
  }
  if (!ids.length) return {};
  const found = await imageSources({ db: deps.db, settings: deps.resolver }, S, ids);
  const out: Record<string, string | null> = {};
  for (const id of ids) {
    const v = [...(found.get(id)?.variants ?? [])].sort((a, b) => b.width - a.width || Number(b.format === 'jpeg') - Number(a.format === 'jpeg'))[0];
    out[id] = v?.url ?? null;
  }
  return out;
}

async function choicesFor(deps: PsDeps, screen: ScreenDef): Promise<Choices> {
  const kinds = new Set(Object.values(screen.widgets).map((w) => w.kind));
  const products = kinds.has('products')
    ? (await deps.db.product.findMany({ where: { storeId: S, archivedAt: null, status: 'PUBLISHED' }, orderBy: [{ nameEn: 'asc' }], select: { id: true, nameEn: true, nameBn: true } })).map((p) => ({ id: p.id, en: p.nameEn, bn: p.nameBn }))
    : [];
  const collections = kinds.has('collection')
    ? (await deps.db.collection.findMany({ where: { storeId: S, archivedAt: null }, orderBy: [{ nameEn: 'asc' }], select: { slug: true, nameEn: true, nameBn: true } })).map((k) => ({ slug: k.slug, en: k.nameEn, bn: k.nameBn }))
    : [];
  return { products, collections };
}

async function valuesOf(deps: PsDeps, screen: ScreenDef): Promise<Record<string, unknown>> {
  const keys = keysOf(screen);
  const vals = await Promise.all(keys.map((k) => deps.resolver.value(k, { storeId: S })));
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
}

/** The screen as the editor draws it. */
export async function pageSettingsView(deps: PsDeps, id: ScreenId): Promise<PageSettingsView> {
  const screen = SCREENS[id];
  const values = await valuesOf(deps, screen);
  const [choices, media] = await Promise.all([choicesFor(deps, screen), mediaPreviews(deps, screen, values)]);
  return {
    screen: id,
    sections: screen.sections.map((s) => ({
      id: s.id,
      more: !!s.more,
      fields: s.keys.map((k) => ({ key: k, node: nodeOf(k), value: values[k], def: registry[k].default })),
    })),
    version: versionOf(values),
    choices,
    media,
    lists: id === 'currency' ? { currencies: CURRENCIES, locales: LOCALES, timeZones: timeZones() } : { currencies: [], locales: [], timeZones: [] },
    preview: null,
  };
}

/** Saves a screen: `{ version, values: { key: value } }`. Only the screen's own keys; only what changed is written. */
export async function savePageSettings(deps: PsDeps, who: PsWho, id: ScreenId, input: unknown): Promise<PageSettingsView> {
  const screen = SCREENS[id];
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const sent = o.values && typeof o.values === 'object' && !Array.isArray(o.values) ? (o.values as Record<string, unknown>) : null;
  if (!sent) throw new PsError('INVALID_INPUT', 400, ['values']);
  const own = new Set<string>(keysOf(screen));
  const stranger = Object.keys(sent).filter((k) => !own.has(k));
  if (stranger.length) throw new PsError('INVALID_INPUT', 400, stranger.map((k) => `${k}: not on this screen`));
  const next: Record<string, unknown> = {};
  const issues: string[] = [];
  for (const k of Object.keys(sent) as Key[]) {
    const r = registry[k].schema.safeParse(sent[k]);
    if (!r.success) {
      for (const i of r.error.issues.slice(0, 3)) issues.push(`${k}${i.path.length ? ' › ' + i.path.join(' › ') : ''}: ${i.message}`);
      continue;
    }
    const bad = platformIssue(k, r.data);
    if (bad) issues.push(`${k}: ${bad}`);
    else next[k] = r.data;
  }
  if (issues.length) throw new PsError('INVALID_INPUT', 400, issues);
  const before = await valuesOf(deps, screen);
  if (o.version !== versionOf(before)) throw new PsError('STALE', 409);
  const how = { actorId: who.actor.staffUserId ?? null, reason: `Website › Page settings › ${id}` };
  const changed: string[] = [];
  for (const k of Object.keys(next) as Key[]) {
    if (sameValue(next[k], before[k])) continue;
    await deps.resolver.set(k, next[k] as never, storeTarget(S), how);
    changed.push(k);
  }
  if (changed.length) {
    await audit(
      deps.db,
      who.actor,
      { storeId: S, action: 'settings.pagesettings.save', entityType: 'Setting', entityId: changed.join(','), before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) },
      who.ctx,
    );
  }
  return pageSettingsView(deps, id);
}

/** `/api/admin/website/page-settings?screen=<id>` — GET (the screen's read key); PUT (its write key). */
export async function pageSettingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const screenId = new URL(request.url).searchParams.get('screen');
  if (!isScreenId(screenId)) return fail(400, 'INVALID_INPUT', ['screen']);
  const screen = SCREENS[screenId];
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? screen.read : screen.write, storeId: S });
  if (g instanceof Response) return g;
  const d: PsDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    return json({ ok: true, ...(method === 'GET' ? await pageSettingsView(d, screenId) : await savePageSettings(d, { actor: g.actor, ctx: g.ctx }, screenId, b)) });
  } catch (e) {
    return e instanceof PsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e);
  }
}
