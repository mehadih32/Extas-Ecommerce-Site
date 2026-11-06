// S02 · PR 76 (Blueprint D1.3 "every section on every page is a toggle plus a position", D4.2; BACKEND-ARCHITECTURE
// WEB-02 Page layouts) — the page builder's lists per page (registry version 240; lane B above main's v231, CN-036).
// The home page keeps its own list (`home.sections`, PR 41; PR 76 adds the screens per section); this file adds the
// category page's: its heading (breadcrumb, title, count), the product listing (filters, sort, grid), the owner's text
// with the questions, and "More collections". The heading and the listing are always shown (a page without its title or
// its products is no category page); each can still move and choose its screens. The defaults draw today's page
// exactly; the owner arranges it on Website › Page layouts. Nothing here changes a price, an order or a customer.
import { z } from 'zod';
import { setting } from './define';
import { layoutDeviceSchema } from './registry-storefront';

const V = 240;

/** The category page's sections in today's order (collections/[slug]/page.tsx). */
export const CATEGORY_SECTIONS = ['head', 'listing', 'info', 'related'] as const;
export type CategorySectionId = (typeof CATEGORY_SECTIONS)[number];
/** Sections a page always shows (they move, they never hide). */
export const CATEGORY_LOCKED: readonly CategorySectionId[] = ['head', 'listing'];

const unique = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id)).size === list.length;

export const categoryLayoutSchema = z
  .array(z.object({ id: z.enum(CATEGORY_SECTIONS), on: z.boolean(), dev: layoutDeviceSchema.optional() }).strict())
  .max(CATEGORY_SECTIONS.length)
  .refine(unique, { message: 'every id must be unique' })
  .refine((list) => list.every((x) => x.on || !CATEGORY_LOCKED.includes(x.id)), { message: 'the heading and the listing are always shown' });
export type CategoryLayout = z.output<typeof categoryLayoutSchema>;

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
};
