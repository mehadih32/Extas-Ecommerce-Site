// S02 · PR 595 (register "Page layout builder (home and every category page)"; Blueprint D1.3, D4.2; BACKEND-ARCHITECTURE
// WEB-02 Page layouts) — the owner's own sections and each category page's own layout (registry version 244; lane B,
// CN-036). Both ship empty, so the shop draws today's pages exactly until the owner adds something.
// - `layout.blocks`: sections the owner adds on Website › Page layouts to the home page or the category pages (all of
//   them, or one): a banner, an offer strip (words only: it never changes a price), a product row or grid (from a
//   category, a tag, his own pick or the newest), a set row (from a set rule), category tiles, reviews, the journal,
//   his own text (plain paragraphs, **bold** and links; never HTML or a script) and a spacer. Each has its own switch
//   (a new one starts hidden), whole days from / to in the store's time zone, its screens and its place: above one of
//   the page's own sections (`before`), or at the end. A section is hidden, never deleted (CLAUDE.md rule 3).
// - `layout.categoryOwn`: one category's own order of the category page's sections (`layout.category`), with its
//   switch; off = that category follows "All category pages" again (the own order is kept).
import { z } from 'zod';
import { setting } from './define';
import { CATEGORY_SECTIONS, categoryLayoutSchema } from './registry-layouts';
import { categorySlugSchema, HOME_SECTIONS, layoutDeviceSchema } from './registry-storefront';

const V = 244;

/** What the owner can add, in the demo's order (96c-layout-builder.js LB_TYPES). */
export const BLOCK_TYPES = ['banner', 'offerStrip', 'productRow', 'productGrid', 'comboRow', 'categoryTiles', 'reviews', 'journal', 'richText', 'spacer'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
/** The pages that take the owner's sections. */
export const BLOCK_PAGES = ['home', 'category'] as const;
export type BlockPage = (typeof BLOCK_PAGES)[number];
/** Where a product row or grid takes its products from. */
export const BLOCK_SOURCES = ['category', 'tag', 'manual', 'newest'] as const;
/** A banner's or strip's colours (the shop's own: brand green, dark, light). */
export const BLOCK_TONES = ['brand', 'dark', 'light'] as const;

// hardcode-ok: the lengths and counts below are the form's limits (how long a word may be, how many cards a row may
// ask for), not business numbers; each section's own count is the owner's, in its data.
const WORDS_MAX = 160;
const TEXT_MAX = 2000;
const LIST_MAX = 24;
const BLOCKS_MAX = 80;
const SPACE_MAX = 200;

/** The owner's words in both languages; either may be empty (the shop falls back to the other, or draws nothing). */
const words = (max = WORDS_MAX) => z.object({ en: z.string().trim().max(max), bn: z.string().trim().max(max) }).strict();
export type BlockWords = z.output<ReturnType<typeof words>>;
/** A link: a page of the shop ("/collections/polo") or a full https address; empty = no link. */
const href = z.string().trim().max(300).regex(/^$|^\/(?!\/)\S*$|^https:\/\/[^\s/]+\.\S+$/, { message: 'a shop path like /collections/polo or an https:// address' });
const count = z.int().min(1).max(LIST_MAX);
const tone = z.enum(BLOCK_TONES);
const productSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);

const products = z
  .object({ title: words(), sub: words(), source: z.enum(BLOCK_SOURCES), cat: categorySlugSchema.or(z.literal('')), tag: z.string().max(80), ids: z.array(productSlug).max(LIST_MAX), limit: count, more: words(), moreHref: href })
  .strict();

const DATA = {
  banner: z.object({ eyebrow: words(), title: words(), text: words(), cta: words(), href, tone, product: productSlug.or(z.literal('')) }).strict(),
  offerStrip: z.object({ text: words(), link: words(), href, tone }).strict(),
  productRow: products,
  productGrid: products,
  comboRow: z.object({ title: words(), sub: words(), rule: z.string().max(80), limit: count }).strict(),
  categoryTiles: z.object({ title: words(), cats: z.array(categorySlugSchema).max(LIST_MAX) }).strict(),
  reviews: z.object({ title: words(), limit: count }).strict(),
  journal: z.object({ title: words(), limit: count }).strict(),
  richText: z.object({ title: words(), body: words(TEXT_MAX) }).strict(),
  spacer: z.object({ phone: z.int().min(0).max(SPACE_MAX), desktop: z.int().min(0).max(SPACE_MAX) }).strict(),
} satisfies Record<BlockType, z.ZodType>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** The page's own sections a block can sit above (home and category; null = the end of the page). */
const ANCHORS = [...new Set<string>([...HOME_SECTIONS, ...CATEGORY_SECTIONS])] as [string, ...string[]];

const base = {
  id: z.string().regex(/^[a-z0-9]{6,16}$/),
  page: z.enum(BLOCK_PAGES),
  /** Category pages only: one category's link name, or null = every category page. */
  cat: categorySlugSchema.nullable(),
  /** The owner's own name for it in the list (the shop never shows it). */
  name: z.string().trim().max(80),
  on: z.boolean(),
  dev: layoutDeviceSchema,
  from: day.nullable(),
  to: day.nullable(),
  before: z.enum(ANCHORS).nullable(),
};

const blockOf = <T extends BlockType>(type: T) => z.object({ ...base, type: z.literal(type), data: DATA[type] }).strict();

export const layoutBlockSchema = z
  .discriminatedUnion('type', [
    blockOf('banner'),
    blockOf('offerStrip'),
    blockOf('productRow'),
    blockOf('productGrid'),
    blockOf('comboRow'),
    blockOf('categoryTiles'),
    blockOf('reviews'),
    blockOf('journal'),
    blockOf('richText'),
    blockOf('spacer'),
  ])
  .refine((b) => !b.from || !b.to || b.from <= b.to, { message: 'the last day is before the first day', path: ['to'] })
  .refine((b) => b.page === 'category' || b.cat === null, { message: 'only a category page has a category', path: ['cat'] })
  .refine((b) => b.before === null || (b.page === 'home' ? (HOME_SECTIONS as readonly string[]) : (CATEGORY_SECTIONS as readonly string[])).includes(b.before), { message: 'not a section of that page', path: ['before'] });
export type LayoutBlock = z.output<typeof layoutBlockSchema>;
export type BlockData<T extends BlockType> = z.output<(typeof DATA)[T]>;

export const layoutBlocksSchema = z
  .array(layoutBlockSchema)
  .max(BLOCKS_MAX)
  .refine((l) => new Set(l.map((b) => b.id)).size === l.length, { message: 'every id must be unique' });

/** One category's own order, kept while its switch is off. */
export const categoryOwnSchema = z
  .array(z.object({ cat: categorySlugSchema, on: z.boolean(), rows: categoryLayoutSchema }).strict())
  .max(500) // hardcode-ok: a list length
  .refine((l) => new Set(l.map((x) => x.cat)).size === l.length, { message: 'one entry per category' });
export type CategoryOwn = z.output<typeof categoryOwnSchema>;

/** A new section's starting words and numbers (the owner changes them; a new section starts hidden). */
export function blockDefaults<T extends BlockType>(type: T): BlockData<T> {
  const w = () => ({ en: '', bn: '' });
  const list = { title: w(), sub: w(), source: 'newest' as const, cat: '', tag: '', ids: [], limit: 8, more: w(), moreHref: '' }; // hardcode-ok: a new section's starting count (the owner changes it)
  const map: { [K in BlockType]: BlockData<K> } = {
    banner: { eyebrow: w(), title: w(), text: w(), cta: w(), href: '', tone: 'brand', product: '' },
    offerStrip: { text: w(), link: w(), href: '', tone: 'brand' },
    productRow: list,
    productGrid: list,
    comboRow: { title: w(), sub: w(), rule: '', limit: 8 }, // hardcode-ok: a new section's starting count (the owner changes it)
    categoryTiles: { title: w(), cats: [] },
    reviews: { title: w(), limit: 6 }, // hardcode-ok: a new section's starting count (the owner changes it)
    journal: { title: w(), limit: 4 }, // hardcode-ok: a new section's starting count (the owner changes it)
    richText: { title: w(), body: w() },
    spacer: { phone: 16, desktop: 32 },
  };
  return structuredClone(map[type]);
}

export const layoutBlockSettings = {
  'layout.blocks': setting({
    scope: 'store',
    schema: layoutBlocksSchema,
    default: [],
    valueType: 'JSON',
    group: 'home',
    labelKey: 'layout.blocks.label',
    helpKey: 'layout.blocks.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 6,
    version: V,
  }),
  'layout.categoryOwn': setting({
    scope: 'store',
    schema: categoryOwnSchema,
    default: [],
    valueType: 'JSON',
    group: 'categoryPage',
    labelKey: 'layout.categoryOwn.label',
    helpKey: 'layout.categoryOwn.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 6,
    version: V,
  }),
};
