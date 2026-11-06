// S02 · PR 596 (register "Side canvas — the empty left and right gutters on desktop"; BACKEND-ARCHITECTURE WEB-02a) —
// the side canvas's switch, numbers and zones (registry version 245; lane B, CN-036). Off as shipped: today's look stays
// until the owner approves it ("চালু করার আগে মালিকের অনুমোদন লাগবে"); the zones he draws are kept while it is off.
// - `layout.sideCanvas`: the master switch; `gap` = the free space a zone keeps from the page's content (px); `float` =
//   how far a floating zone drifts up and down while scrolling (px); `minWidth` = the narrowest window that shows it.
// - `layout.sideZones`: the zones, each on the left or right gutter, on the home page, every category page or chosen
//   categories, with its own switch and whole days; its place (top, from under the header) and standard size (it
//   scales down to the room a screen gives, never covers content, and hides when even the smallest size does not fit);
//   fixed, sticky or gently floating; what it holds: a product's or a category's picture with a link (house ad), an
//   image from an https address, or a small offer button (pop-up teaser, words only). Desktop with a mouse only.
import { z } from 'zod';
import { setting } from './define';
import { categorySlugSchema } from './registry-storefront';

const V = 245;

export const SIDE_KINDS = ['product', 'category', 'image', 'teaser'] as const;
export type SideKind = (typeof SIDE_KINDS)[number];
export const SIDE_MODES = ['fixed', 'sticky', 'float'] as const;
export const SIDE_PAGES = ['home', 'categories', 'both'] as const;

// hardcode-ok: the form's limits (a zone's size and place in px, list lengths), not business numbers
const PX_MAX = 2000;
const ZONES_MAX = 24;

const words = z.object({ en: z.string().trim().max(120), bn: z.string().trim().max(120) }).strict();
const href = z.string().trim().max(300).regex(/^$|^\/(?!\/)\S*$|^https:\/\/[^\s/]+\.\S+$/, { message: 'a shop path like /collections/polo or an https:// address' });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const sideCanvasSchema = z
  .object({
    enabled: z.boolean(),
    gap: z.int().min(0).max(200),
    float: z.int().min(0).max(200),
    minWidth: z.int().min(1024).max(4000),
  })
  .strict();
export type SideCanvas = z.output<typeof sideCanvasSchema>;

export const sideZoneSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]{6,16}$/),
    name: z.string().trim().max(80),
    side: z.enum(['left', 'right']),
    on: z.boolean(),
    pages: z.enum(SIDE_PAGES),
    /** Category pages only: the chosen categories (empty = every category page). */
    cats: z.array(categorySlugSchema).max(ZONES_MAX),
    from: day.nullable(),
    to: day.nullable(),
    top: z.int().min(0).max(PX_MAX),
    width: z.int().min(40).max(600),
    height: z.int().min(40).max(PX_MAX),
    mode: z.enum(SIDE_MODES),
    kind: z.enum(SIDE_KINDS),
    /** product / category: its link name; image: an https:// address or a shop path. */
    ref: z.string().trim().max(300),
    alt: words,
    /** teaser: its words; product / category / image: a line under the picture (optional). */
    text: words,
    href,
    /** card = on a white card with a shadow; full = straight on the page background, no frame. */
    style: z.enum(['card', 'full']),
  })
  .strict()
  .refine((z1) => !z1.from || !z1.to || z1.from <= z1.to, { message: 'the last day is before the first day', path: ['to'] })
  .refine((z1) => z1.kind !== 'image' || /^\/(?!\/)\S*$|^https:\/\/[^\s/]+\.\S+$/.test(z1.ref), { message: 'an image needs an https:// address or a shop path', path: ['ref'] });
export type SideZone = z.output<typeof sideZoneSchema>;

export const sideZonesSchema = z
  .array(sideZoneSchema)
  .max(ZONES_MAX)
  .refine((l) => new Set(l.map((x) => x.id)).size === l.length, { message: 'every id must be unique' });

export const sideCanvasSettings = {
  'layout.sideCanvas': setting({
    scope: 'store',
    schema: sideCanvasSchema,
    default: { enabled: false, gap: 16, float: 40, minWidth: 1280 }, // hardcode-ok: the demo's gutter rule (zone + 16 px) and 1280–1920 map
    valueType: 'JSON',
    group: 'home',
    labelKey: 'layout.sideCanvas.label',
    helpKey: 'layout.sideCanvas.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 7,
    version: V,
  }),
  'layout.sideZones': setting({
    scope: 'store',
    schema: sideZonesSchema,
    default: [],
    valueType: 'JSON',
    group: 'home',
    labelKey: 'layout.sideZones.label',
    helpKey: 'layout.sideZones.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 8,
    version: V,
  }),
};
