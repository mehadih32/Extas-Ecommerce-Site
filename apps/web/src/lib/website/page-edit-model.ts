// S02 · PR 600 (register "On-page edit mode"; Blueprint D10.6) — the pure part of editing a shop page in place, shared by
// the server (lib/website/page-edit-admin.ts) and its tests. No database, no request.
// - Which section of which page the owner may edit here, and with which of its own settings (CATALOGUE below): the
//   page's sections (show / hide, screens, move up or down) from Website › Page layouts (PR 76 / 595), the home page's
//   texts and numbers (PR 41–43), the owner's own sections' words and counts (PR 595). Only settings that are part of a
//   saved shop look (look-model LOOK_KEYS) are edited, so Publish and undo go through the saved-looks path (PR 597).
// - Money is never edited here: prices, offers, discounts, Smart Rules, the flash sale, the bag's tier box and COD are
//   shown as links to their own admin page. The bag and the checkout are locked (their tested structure stays).
// - `lightOnly` (the phone's light version): texts only, plus the money links; no moving, no numbers.
// - `desktopOnly`: "Apply to phone too?" → No keeps a change to computers where the shop can (a section shown or
//   hidden becomes a section kept to one kind of screen); anything else answers null and stays in the draft.
// - `judgePhone`: what the browser measured on one phone size, read against the owner's checks.
import { createHash } from 'node:crypto';
import { registry, type LayoutDevice } from '@extas/settings';
import { fullLayout, moveRow, PAGE_LAYOUTS, type LayoutRow } from '../shop/layouts';
import type { LookKey } from './look-model';

/** The settings this mode may write (all part of a saved shop look). */
export const EDIT_KEYS = ['home.sections', 'home.hero', 'home.heroSlides', 'home.categories', 'home.newIn', 'home.reviews', 'layout.category', 'layout.product', 'layout.blocks'] as const satisfies readonly LookKey[];
export type EditKey = (typeof EDIT_KEYS)[number];
export const isEditKey = (k: unknown): k is EditKey => typeof k === 'string' && (EDIT_KEYS as readonly string[]).includes(k);

/** The shop's page kinds as the bar sees them. */
export const EDIT_PAGES = ['home', 'category', 'product', 'bag', 'checkout', 'other'] as const;
export type EditPage = (typeof EDIT_PAGES)[number];
/** Pages whose sections are never edited here. */
export const LOCKED_PAGES: readonly EditPage[] = ['bag', 'checkout'];

export type FieldKind = 'show' | 'dev' | 'move' | 'label' | 'words' | 'number' | 'toggle';
/** One step into a setting's value: a property, or the list entry with that id. */
export type Step = string | { id: string };

export interface FieldDef {
  /** Unique in its section (the panel sends it back). */
  id: string;
  key: EditKey;
  path: Step[];
  kind: FieldKind;
  /** The word for its label (page-edit.<lang>.json `f.<name>`). */
  name: string;
  min?: number;
  max?: number;
}

export interface MoneyLink {
  /** page-edit.<lang>.json `money.<name>`. */
  name: string;
  href: string;
}

export interface SectionDef {
  page: EditPage;
  id: string;
  fields: FieldDef[];
  money: MoneyLink[];
  /** Where the rest of this section is set up (page-edit.<lang>.json `more.<name>`). */
  more: MoneyLink | null;
  locked: boolean;
}

// ---- admin places (the existing pages; money is only ever edited there) ----------------------------------------------
export const PLACES = {
  layouts: '/admin/website/layouts',
  words: '/admin/website/words',
  products: '/admin/products',
  rules: '/admin/rules',
  combos: '/admin/combos',
  bagBox: '/admin/combos/bag-box',
  festive: '/admin/marketing/festive',
  shimmer: '/admin/settings/shimmer',
  blog: '/admin/website/blog',
  reviews: '/admin/products/reviews',
} as const;

const LIST_KEY: Record<'home' | 'category' | 'product', 'home.sections' | 'layout.category' | 'layout.product'> = { home: 'home.sections', category: 'layout.category', product: 'layout.product' };
const LAYOUT_OF = { home: 'home', category: 'category', product: 'product' } as const;

/** The smallest and largest number a setting's field takes (read from its schema, so the panel never guesses). */
export function boundsOf(key: EditKey, prop: string): { min?: number; max?: number } {
  let s: unknown = registry[key].schema;
  for (let i = 0; i < 4 && s && typeof s === 'object'; i++) {
    const o = s as { shape?: Record<string, unknown>; unwrap?: () => unknown; def?: { innerType?: unknown; in?: unknown } };
    if (o.shape) {
      const f = o.shape[prop] as { minValue?: number | null; maxValue?: number | null } | undefined;
      if (!f) return {};
      return { ...(typeof f.minValue === 'number' && Number.isFinite(f.minValue) ? { min: f.minValue } : {}), ...(typeof f.maxValue === 'number' && Number.isFinite(f.maxValue) ? { max: f.maxValue } : {}) };
    }
    s = o.def?.innerType ?? o.def?.in ?? null;
  }
  return {};
}

const num = (key: EditKey, path: Step[], name: string): FieldDef => ({ id: `${key}:${path.map((p) => (typeof p === 'string' ? p : p.id)).join('.')}`, key, path, kind: 'number', name, ...boundsOf(key, String(path[path.length - 1])) });
const field = (key: EditKey, path: Step[], kind: FieldKind, name: string): FieldDef => ({ id: `${key}:${path.map((p) => (typeof p === 'string' ? p : p.id)).join('.')}:${kind}`, key, path, kind, name });

/** Show / screens / move for a page's own section (locked sections always show). */
function layoutFields(page: 'home' | 'category' | 'product', id: string): FieldDef[] {
  const key = LIST_KEY[page];
  const locked = (PAGE_LAYOUTS[LAYOUT_OF[page]].locked as readonly string[]).includes(id);
  return [...(locked ? [] : [field(key, [{ id }], 'show', 'show')]), field(key, [{ id }], 'dev', 'dev'), field(key, [{ id }], 'move', 'move')];
}

const HOME_EXTRA: Record<string, { fields: FieldDef[]; money: MoneyLink[]; more: MoneyLink | null }> = {
  hero: {
    fields: [
      field('home.hero', ['eyebrow'], 'label', 'eyebrow'),
      field('home.hero', ['title'], 'label', 'title'),
      field('home.hero', ['sub'], 'label', 'sub'),
      field('home.hero', ['buttons', { id: 'shop' }, 'label'], 'label', 'shopButton'),
      field('home.hero', ['buttons', { id: 'shop' }, 'on'], 'toggle', 'shopButtonOn'),
      field('home.hero', ['buttons', { id: 'sets' }, 'label'], 'label', 'setsButton'),
      field('home.hero', ['buttons', { id: 'sets' }, 'on'], 'toggle', 'setsButtonOn'),
      num('home.heroSlides', ['count'], 'slides'),
      num('home.heroSlides', ['speed'], 'speed'),
      field('home.heroSlides', ['inStockOnly'], 'toggle', 'inStockOnly'),
    ],
    money: [],
    more: { name: 'layouts', href: PLACES.layouts },
  },
  categories: { fields: [num('home.categories', ['max'], 'maxCategories')], money: [], more: { name: 'layouts', href: PLACES.layouts } },
  'new-in': { fields: [num('home.newIn', ['count'], 'count')], money: [{ name: 'prices', href: PLACES.products }], more: { name: 'layouts', href: PLACES.layouts } },
  reviews: { fields: [num('home.reviews', ['count'], 'count'), num('home.reviews', ['minRating'], 'minRating'), field('home.reviews', ['summary'], 'toggle', 'summary')], money: [], more: { name: 'reviews', href: PLACES.reviews } },
  sets: { fields: [], money: [{ name: 'sets', href: PLACES.combos }, { name: 'rules', href: PLACES.rules }], more: { name: 'combos', href: PLACES.combos } },
  'flash-sale': { fields: [], money: [{ name: 'flash', href: PLACES.rules }, { name: 'prices', href: PLACES.products }], more: { name: 'rules', href: PLACES.rules } },
  festive: { fields: [], money: [{ name: 'rules', href: PLACES.rules }], more: { name: 'festive', href: PLACES.festive } },
  journal: { fields: [], money: [], more: { name: 'blog', href: PLACES.blog } },
};

type Entry = Record<string, unknown>;
const isWords = (v: unknown): v is { en: string; bn: string } => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 2 && typeof (v as Entry).en === 'string' && typeof (v as Entry).bn === 'string';

/** An owner's own section (`lb-<id>`): show, screens, every text of it, its counts; its offer rule and links elsewhere. */
function blockSection(page: EditPage, blockId: string, blocks: unknown): SectionDef | null {
  const list = Array.isArray(blocks) ? (blocks as Entry[]) : [];
  const b = list.find((x) => x && x.id === blockId);
  if (!b || b.page !== page) return null;
  const at: Step[] = [{ id: blockId }];
  const fields: FieldDef[] = [field('layout.blocks', at, 'show', 'show'), field('layout.blocks', at, 'dev', 'dev')];
  const data = b.data && typeof b.data === 'object' ? (b.data as Entry) : {};
  for (const [prop, v] of Object.entries(data)) {
    if (isWords(v)) fields.push(field('layout.blocks', [...at, 'data', prop], 'words', `w.${prop}`));
    else if (typeof v === 'number' && (prop === 'limit' || prop === 'phone' || prop === 'desktop')) fields.push({ ...field('layout.blocks', [...at, 'data', prop], 'number', `n.${prop}`), min: 0 });
  }
  const money: MoneyLink[] = b.type === 'comboRow' ? [{ name: 'rules', href: PLACES.rules }] : b.type === 'productRow' || b.type === 'productGrid' || b.type === 'banner' ? [{ name: 'prices', href: PLACES.products }] : [];
  return { page, id: `lb-${blockId}`, fields, money, more: { name: 'layouts', href: PLACES.layouts }, locked: false };
}

/** The section the owner pressed Edit on, with what may be changed here (null: not a section of that page). */
export function sectionDef(page: EditPage, id: string, blocks: unknown): SectionDef | null {
  if (LOCKED_PAGES.includes(page)) {
    const money = page === 'bag' ? [{ name: 'bagBox', href: PLACES.bagBox }] : [];
    return { page, id, fields: [], money, more: page === 'bag' ? { name: 'layouts', href: PLACES.layouts } : null, locked: true };
  }
  if (id.startsWith('lb-')) return page === 'home' || page === 'category' ? blockSection(page, id.slice(3), blocks) : null;
  if (page !== 'home' && page !== 'category' && page !== 'product') return null;
  if (!(PAGE_LAYOUTS[LAYOUT_OF[page]].ids as readonly string[]).includes(id)) return null;
  const extra = page === 'home' ? HOME_EXTRA[id] : undefined;
  const money: MoneyLink[] = extra?.money ?? (page === 'category' && id === 'listing' ? [{ name: 'prices', href: PLACES.products }] : page === 'product' && id === 'rows' ? [{ name: 'prices', href: PLACES.products }] : []);
  return { page, id, fields: [...layoutFields(page, id), ...(extra?.fields ?? [])], money, more: extra?.more ?? { name: page === 'category' ? 'layoutsCat' : 'layouts', href: PLACES.layouts }, locked: false };
}

/** What every page shows besides its sections (prices and offers always link to their own place). */
export function pageMoney(page: EditPage): MoneyLink[] {
  if (page === 'product') return [{ name: 'prices', href: PLACES.products }, { name: 'rules', href: PLACES.rules }];
  if (page === 'bag') return [{ name: 'bagBox', href: PLACES.bagBox }, { name: 'rules', href: PLACES.rules }];
  if (page === 'category') return [{ name: 'prices', href: PLACES.products }];
  return [];
}

/** The light version (a phone): texts only. */
export const lightOnly = (fields: readonly FieldDef[]): FieldDef[] => fields.filter((f) => f.kind === 'label' || f.kind === 'words');

// ---- reading and writing a field ------------------------------------------------------------------------------------

const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const idOf = (e: unknown): string | null => (e && typeof e === 'object' ? (typeof (e as Entry).id === 'string' ? ((e as Entry).id as string) : typeof (e as Entry).cat === 'string' ? ((e as Entry).cat as string) : null) : null);

/** The value at a path (undefined when it is not there). */
export function getAt(value: unknown, path: readonly Step[]): unknown {
  let v: unknown = value;
  for (const s of path) {
    if (v === null || v === undefined) return undefined;
    if (typeof s === 'string') v = typeof v === 'object' && !Array.isArray(v) ? (v as Entry)[s] : undefined;
    else v = Array.isArray(v) ? v.find((e) => idOf(e) === s.id) : undefined;
  }
  return v;
}

/** A copy with the value at a path replaced (null: the path is not there). */
export function setAt(value: unknown, path: readonly Step[], next: unknown): unknown | null {
  if (!path.length) return clone(next);
  const [s, ...rest] = path;
  if (typeof s === 'string') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || (rest.length && !(s in (value as Entry)))) return null;
    const inner = rest.length ? setAt((value as Entry)[s], rest, next) : clone(next);
    if (inner === null && rest.length) return null;
    return { ...(value as Entry), [s]: inner };
  }
  if (!Array.isArray(value)) return null;
  const i = value.findIndex((e) => idOf(e) === s!.id);
  if (i < 0) return null;
  const inner = rest.length ? setAt(value[i], rest, next) : clone(next);
  if (inner === null) return null;
  return value.map((e, j) => (j === i ? inner : e));
}

export const DEVICES: readonly LayoutDevice[] = ['both', 'phone', 'desktop'];

/** The field's value as the panel shows it. */
export function readField(f: FieldDef, value: unknown): unknown {
  if (f.key === 'home.sections' || f.key === 'layout.category' || f.key === 'layout.product') {
    const page = f.key === 'home.sections' ? 'home' : f.key === 'layout.category' ? 'category' : 'product';
    const rows = fullLayout(page, value as LayoutRow[]);
    const id = (f.path[0] as { id: string }).id;
    const i = rows.findIndex((r) => r.id === id);
    const r = rows[i];
    if (!r) return null;
    if (f.kind === 'show') return r.on;
    if (f.kind === 'dev') return r.dev ?? 'both';
    if (f.kind === 'move') return { at: i, of: rows.length };
  }
  const v = getAt(value, f.path);
  if (f.kind === 'show') return getAt(value, [...f.path, 'on']) === true;
  if (f.kind === 'dev') return (getAt(value, [...f.path, 'dev']) as string) ?? 'both';
  return v ?? null;
}

export class EditInputError extends Error {
  constructor(readonly field: string) {
    super('INVALID_INPUT');
  }
}

const text = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.trim().slice(0, max) : null);
// hardcode-ok: text-length guards of the panel (the setting's schema has the final say)
const LABEL_MAX = 160;

/**
 * The setting's whole value after one field changed (`value` before), checked against the setting's rules. Throws
 * EditInputError when the input does not fit.
 */
export function applyField(f: FieldDef, value: unknown, input: unknown): unknown {
  let next: unknown = null;
  if (f.key === 'home.sections' || f.key === 'layout.category' || f.key === 'layout.product') {
    const page = f.key === 'home.sections' ? 'home' : f.key === 'layout.category' ? 'category' : 'product';
    const rows = fullLayout(page, value as LayoutRow[]);
    const id = (f.path[0] as { id: string }).id;
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw new EditInputError(f.id);
    if (f.kind === 'show' && typeof input === 'boolean') next = rows.map((r, j) => (j === i ? { ...r, on: input } : r));
    else if (f.kind === 'dev' && DEVICES.includes(input as LayoutDevice)) next = rows.map((r, j) => (j === i ? withDev(r, input as LayoutDevice) : r));
    else if (f.kind === 'move' && (input === 'up' || input === 'down')) next = moveRow(rows, i, input === 'up' ? i - 1 : i + 1);
    else throw new EditInputError(f.id);
  } else if (f.kind === 'show' || f.kind === 'dev') {
    const ok = f.kind === 'show' ? typeof input === 'boolean' : DEVICES.includes(input as LayoutDevice);
    if (!ok) throw new EditInputError(f.id);
    next = setAt(value, [...f.path, f.kind === 'show' ? 'on' : 'dev'], input);
  } else if (f.kind === 'toggle') {
    if (typeof input !== 'boolean') throw new EditInputError(f.id);
    next = setAt(value, f.path, input);
  } else if (f.kind === 'number') {
    if (typeof input !== 'number' || !Number.isInteger(input) || (f.min !== undefined && input < f.min) || (f.max !== undefined && input > f.max)) throw new EditInputError(f.id);
    next = setAt(value, f.path, input);
  } else if (f.kind === 'label' || f.kind === 'words') {
    const o = input && typeof input === 'object' ? (input as Entry) : {};
    const en = text(o.en, LABEL_MAX);
    const bn = text(o.bn, LABEL_MAX);
    if (en === null || bn === null) throw new EditInputError(f.id);
    // A shop label needs both languages (an empty one would draw nothing); an own section's words may be empty.
    if (f.kind === 'label' && (!en || !bn)) throw new EditInputError(f.id);
    next = setAt(value, f.path, { en, bn });
  }
  if (next === null) throw new EditInputError(f.id);
  const ok = registry[f.key].schema.safeParse(next);
  if (!ok.success) throw new EditInputError(f.id);
  return ok.data;
}

function withDev(r: LayoutRow, dev: LayoutDevice): LayoutRow {
  const { dev: _old, ...rest } = r;
  return dev === 'both' ? rest : { ...rest, dev };
}

// ---- "Apply to phone too?" → No ---------------------------------------------------------------------------------------

const rowsOf = (key: EditKey, v: unknown): Entry[] => {
  if (key === 'home.sections') return fullLayout('home', v as LayoutRow[]) as unknown as Entry[];
  if (key === 'layout.category') return fullLayout('category', v as LayoutRow[]) as unknown as Entry[];
  if (key === 'layout.product') return fullLayout('product', v as LayoutRow[]) as unknown as Entry[];
  return Array.isArray(v) ? (v as Entry[]) : [];
};
const sansShow = (e: Entry) => {
  const { on: _on, dev: _dev, ...rest } = e;
  return JSON.stringify(rest);
};

/**
 * The draft's value kept to computers: a section shown or hidden in the draft becomes one kept to the other kind of
 * screen, so phones see what they saw before. Null when the change cannot be kept to computers (an order, a text, a
 * number): it then stays in the draft.
 */
export function desktopOnly(key: EditKey, live: unknown, draft: unknown): unknown | null {
  if (key !== 'home.sections' && key !== 'layout.category' && key !== 'layout.product' && key !== 'layout.blocks') return null;
  const a = rowsOf(key, live);
  const b = rowsOf(key, draft);
  if (a.length !== b.length || a.some((e, i) => idOf(e) !== idOf(b[i]) || sansShow(e) !== sansShow(b[i]!))) return null;
  const out = b.map((d, i) => {
    const l = a[i]!;
    const ldev = (l.dev as LayoutDevice | undefined) ?? 'both';
    const ddev = (d.dev as LayoutDevice | undefined) ?? 'both';
    // A change of screens is already a choice of screens: kept as the owner set it.
    if (ldev !== ddev || l.on === d.on) return d;
    // Hidden on computers only: it keeps showing on phones (if it showed there before).
    if (l.on && !d.on) return ldev === 'both' ? { ...d, on: true, dev: 'phone' } : ldev === 'phone' ? { ...d, on: true, dev: 'phone' } : d;
    // Shown on computers only: phones stay as they were (hidden).
    return ddev === 'both' ? { ...d, dev: 'desktop' } : ddev === 'phone' ? { ...d, on: false } : d;
  });
  const ok = registry[key].schema.safeParse(key === 'layout.blocks' ? out : out.map((r) => ((r.dev ?? 'both') === 'both' ? { id: r.id, on: r.on } : { id: r.id, on: r.on, dev: r.dev })));
  return ok.success ? ok.data : null;
}

// ---- the phone checks (page-edit-phone.ts: no imports, so the shop panel can use it) --------------------------------
export { judgePhone, type PhoneIssue, type PhoneMeasure } from './page-edit-phone';

// ---- the page kind of a path (page-kind.ts: no imports, so the shop's own beacon can use it) ---------------------------
export { pageKindOf } from './page-kind';

export const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);
