// S02 · PR 76 (Blueprint D1.3 "every section on every page is a toggle plus a position", D4.2; BACKEND-ARCHITECTURE
// WEB-02 Page layouts) — the page builder's lists per page (registry version 240; lane B above main's v231, CN-036).
// The home page keeps its own list (`home.sections`, PR 41; PR 76 adds the screens per section); this file adds the
// category page's: its heading (breadcrumb, title, count), the product listing (filters, sort, grid), the owner's text
// with the questions, and "More collections". The heading and the listing are always shown (a page without its title or
// its products is no category page); each can still move and choose its screens. The defaults draw today's page
// exactly; the owner arranges it on Website › Page layouts. Nothing here changes a price, an order or a customer.
// PR 77 (registry version 241, "page builder coverage for every storefront page"): the product page's sections under
// the photos and buy column (other styles when off sale, reviews, questions, the Messenger button, the rows of other
// styles) and the bag's left column (free delivery bar, the bag's lines, the offer, WhatsApp help, the bulk order
// card, saved for later). The first screen (photos, buy column, buy bar; the bag's summary and its phone bar) stays
// fixed: it is held by the phone gate's first-screen budget (PR 53), not by a list.
import { z } from 'zod';
import { setting } from './define';
import { layoutDeviceSchema } from './registry-storefront';

const V = 240;
const V77 = 241;

/** The category page's sections in today's order (collections/[slug]/page.tsx). */
export const CATEGORY_SECTIONS = ['head', 'listing', 'info', 'related'] as const;
export type CategorySectionId = (typeof CATEGORY_SECTIONS)[number];
/** Sections a page always shows (they move, they never hide). */
export const CATEGORY_LOCKED: readonly CategorySectionId[] = ['head', 'listing'];

/** PR 77 · the product page's sections under the first screen, in today's order (ProductPage.tsx). */
export const PRODUCT_SECTIONS = ['alternatives', 'reviews', 'questions', 'messenger', 'rows'] as const;
export type ProductSectionId = (typeof PRODUCT_SECTIONS)[number];
export const PRODUCT_LOCKED: readonly ProductSectionId[] = [];
/** PR 77 · the bag's left column, in today's order (BagPage.tsx); the lines always show. */
export const BAG_SECTIONS = ['free', 'lines', 'offer', 'whatsapp', 'bulk', 'saved'] as const;
export type BagSectionId = (typeof BAG_SECTIONS)[number];
export const BAG_LOCKED: readonly BagSectionId[] = ['lines'];

const unique = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id)).size === list.length;

/** A page's list: its known sections once each, a locked one never hidden, each with its screens (optional). */
function sectionsSchema<const T extends readonly [string, ...string[]]>(ids: T, locked: readonly T[number][]) {
  return z
    .array(z.object({ id: z.enum(ids), on: z.boolean(), dev: layoutDeviceSchema.optional() }).strict())
    .max(ids.length)
    .refine(unique, { message: 'every id must be unique' })
    .refine((list) => list.every((x) => x.on || !locked.includes(x.id)), { message: 'a locked section is always shown' });
}

// ~~z.array(…).refine(… 'the heading and the listing are always shown')~~ PR 77: one builder for every page
export const categoryLayoutSchema = sectionsSchema(CATEGORY_SECTIONS, CATEGORY_LOCKED);
export type CategoryLayout = z.output<typeof categoryLayoutSchema>;
export const productLayoutSchema = sectionsSchema(PRODUCT_SECTIONS, PRODUCT_LOCKED);
export const bagLayoutSchema = sectionsSchema(BAG_SECTIONS, BAG_LOCKED);

export const layoutSettings = {
  'layout.category': setting({
    scope: 'store',
    schema: categoryLayoutSchema,
    default: CATEGORY_SECTIONS.map((id) => ({ id, on: true })),
    valueType: 'JSON',
    group: 'categoryPage',
    labelKey: 'layout.category.label',
    helpKey: 'layout.category.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 5,
    version: V,
  }),
  'layout.product': setting({
    scope: 'store',
    schema: productLayoutSchema,
    default: PRODUCT_SECTIONS.map((id) => ({ id, on: true })),
    valueType: 'JSON',
    group: 'productPage',
    labelKey: 'layout.product.label',
    helpKey: 'layout.product.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 5,
    version: V77,
  }),
  'layout.bag': setting({
    scope: 'store',
    schema: bagLayoutSchema,
    default: BAG_SECTIONS.map((id) => ({ id, on: true })),
    valueType: 'JSON',
    group: 'bag',
    labelKey: 'layout.bag.label',
    helpKey: 'layout.bag.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 5,
    version: V77,
  }),
};
