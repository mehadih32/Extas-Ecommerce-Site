// S02 · PR 597 (register "Launch default — save and restore"; BACKEND-ARCHITECTURE WEB-07; CN-012 (1), CN-014 (3c)) — the
// pure part of a saved shop look, shared by Website › Launch default (lib/website/launch-default-admin.ts) and its tests.
// - A look is a LayoutSnapshot whose payload is `{ scope: 'shop', settings: { <look key>: value }, rows: { houseAds,
//   placements } }`: the values of the settings that make the shop's look (LOOK_KEYS: the home page's sections, hero and
//   rows, every page layout, the owner's own sections, one category's own order, the side canvas and its zones, the light
//   sweeps) and which house ads and placements are switched on. Home looks of Marketing › Seasonal home use the scope
//   'home' and are never listed here (lib/shop/seasonal-home-model.ts).
// - Left out on purpose: anything that names money (the announcement bar names the free-delivery amount and Cash on
//   Delivery, the flash sale its timer and markdowns), the bag and checkout (their tested structure stays), words and
//   eye-toggles (their own history). A restore never changes a price, a discount, COD or a delivery charge.
// - Restoring never drops anything the owner made after the look was saved: a section, zone or category order that is
//   not in the look is kept at the end, switched off ("kept as a hidden copy"). Values that no longer fit their
//   setting's rules are left as they are now (reported), so a restore never breaks a page.
import { createHash } from 'node:crypto';
import { registry } from '@extas/settings';

/** The settings a shop look carries, in the order they are shown and written. */
export const LOOK_KEYS = [
  'home.sections',
  'home.hero',
  'home.heroSlides',
  'home.categories',
  'home.newIn',
  'home.reviews',
  'home.rowFade',
  'layout.category',
  'layout.categoryOwn',
  'layout.product',
  'layout.blocks',
  'layout.sideCanvas',
  'layout.sideZones',
  'shop.sweep',
  'pdp.sweep',
] as const satisfies readonly (keyof typeof registry)[];
export type LookKey = (typeof LOOK_KEYS)[number];

/** The payload's marker for a whole-shop look (Seasonal home's looks are 'home'). */
export const LOOK_SCOPE = 'shop';

/** Which house ads and placements were switched on (ids, sorted). */
export interface LookRows {
  houseAds: string[];
  placements: string[];
}

/** A look saved by the system just before a restore or an undo, so that step can itself be undone. */
export interface LookAuto {
  kind: 'restore' | 'undo';
  /** The name of the look that was restored (shown as "Before restoring …"). */
  of: string;
}

export interface LookPayload {
  scope: typeof LOOK_SCOPE;
  settings: Partial<Record<LookKey, unknown>>;
  rows: LookRows;
  auto?: LookAuto;
}

export const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);

const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].sort() : []);

/** Is this payload a whole-shop look? */
export const isShopLook = (payload: unknown): boolean => !!payload && typeof payload === 'object' && (payload as Record<string, unknown>).scope === LOOK_SCOPE;

/** The look as saved (anything that is not a shop look reads as an empty look; values are checked when restored). */
export function lookOf(payload: unknown): LookPayload {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const raw = p.scope === LOOK_SCOPE && p.settings && typeof p.settings === 'object' ? (p.settings as Record<string, unknown>) : {};
  const settings: Partial<Record<LookKey, unknown>> = {};
  for (const k of LOOK_KEYS) if (k in raw) settings[k] = raw[k];
  const rows = p.rows && typeof p.rows === 'object' ? (p.rows as Record<string, unknown>) : {};
  const a = p.auto && typeof p.auto === 'object' ? (p.auto as Record<string, unknown>) : null;
  const auto: LookAuto | undefined = a && (a.kind === 'restore' || a.kind === 'undo') ? { kind: a.kind, of: typeof a.of === 'string' ? a.of : '' } : undefined;
  return { scope: LOOK_SCOPE, settings, rows: { houseAds: ids(rows.houseAds), placements: ids(rows.placements) }, ...(auto ? { auto } : {}) };
}

type Entry = Record<string, unknown>;
const entryId = (e: unknown): string | null => {
  if (!e || typeof e !== 'object') return null;
  const o = e as Entry;
  if (typeof o.id === 'string') return `id:${o.id}`;
  if (typeof o.cat === 'string') return `cat:${o.cat}`;
  return null;
};

/**
 * The value a restore writes for one list setting: the saved list in its saved order, then every entry made since
 * (not in the saved list) at the end, switched off. Entries without a switch, and values that are not lists, are the
 * saved value as is.
 */
export function keepHidden(saved: unknown, current: unknown): { value: unknown; hidden: number } {
  if (!Array.isArray(saved) || !Array.isArray(current)) return { value: saved, hidden: 0 };
  const have = new Set(saved.map(entryId).filter((x): x is string => x !== null));
  const extra = current.filter((e) => {
    const id = entryId(e);
    return id !== null && !have.has(id) && typeof (e as Entry).on === 'boolean';
  });
  return { value: [...saved, ...extra.map((e) => ({ ...(e as Entry), on: false }))], hidden: extra.filter((e) => (e as Entry).on === true).length };
}

export interface RestorePlan {
  /** The values to write (only those that differ from now). */
  writes: { key: LookKey; value: unknown }[];
  /** Keys the look does not carry, or whose saved value no longer fits: they stay as they are now. */
  kept: LookKey[];
  /** Keys whose newer entries did not fit beside the saved ones: those entries live on in the "before" look only. */
  crowded: LookKey[];
  /** Entries that were showing and are now kept as hidden copies. */
  hidden: number;
}

/** What restoring `saved` over `now` writes: checked against each setting's rules, nothing dropped that fits. */
export function planRestore(saved: LookPayload, now: Partial<Record<LookKey, unknown>>): RestorePlan {
  const plan: RestorePlan = { writes: [], kept: [], crowded: [], hidden: 0 };
  for (const key of LOOK_KEYS) {
    if (!(key in saved.settings)) {
      plan.kept.push(key);
      continue;
    }
    const schema = registry[key].schema;
    const fit = schema.safeParse(saved.settings[key]);
    if (!fit.success) {
      plan.kept.push(key);
      continue;
    }
    const merged = keepHidden(fit.data, now[key]);
    const ok = schema.safeParse(merged.value);
    let value: unknown = fit.data;
    if (ok.success) {
      value = ok.data;
      plan.hidden += merged.hidden;
    } else plan.crowded.push(key);
    if (versionOf(value) !== versionOf(now[key])) plan.writes.push({ key, value });
  }
  return plan;
}

/** The rows a restore switches: on = in the saved list, off = everything else that is on now. */
export function planRows(saved: LookRows, now: LookRows): { on: LookRows; off: LookRows } {
  const diff = (want: string[], have: string[]) => ({ on: want.filter((id) => !have.includes(id)), off: have.filter((id) => !want.includes(id)) });
  const a = diff(saved.houseAds, now.houseAds);
  const p = diff(saved.placements, now.placements);
  return { on: { houseAds: a.on, placements: p.on }, off: { houseAds: a.off, placements: p.off } };
}

export interface LookSummary {
  /** The owner's own sections (PR 595): all, and how many are switched on. */
  sections: number;
  sectionsOn: number;
  /** The side canvas (PR 596): on or off, its zones and how many are switched on. */
  canvasOn: boolean;
  zones: number;
  zonesOn: number;
  /** Categories with their own order switched on. */
  ownOn: number;
  /** House ads switched on. */
  ads: number;
}

const listOf = (v: unknown): Entry[] => (Array.isArray(v) ? (v.filter((e) => e && typeof e === 'object') as Entry[]) : []);

/** A short count of what a look holds (the list's chips). */
export function summaryOf(look: LookPayload): LookSummary {
  const blocks = listOf(look.settings['layout.blocks']);
  const zones = listOf(look.settings['layout.sideZones']);
  const canvas = look.settings['layout.sideCanvas'];
  return {
    sections: blocks.length,
    sectionsOn: blocks.filter((b) => b.on === true).length,
    canvasOn: !!canvas && typeof canvas === 'object' && (canvas as Entry).enabled === true,
    zones: zones.length,
    zonesOn: zones.filter((z) => z.on === true).length,
    ownOn: listOf(look.settings['layout.categoryOwn']).filter((c) => c.on === true).length,
    ads: look.rows.houseAds.length,
  };
}
