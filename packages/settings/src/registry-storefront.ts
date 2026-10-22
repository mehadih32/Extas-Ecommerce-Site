// S02 · the storefront foundation — PR 82 (four themes and their tokens), 501 (branding and appearance from settings),
// 503 + 84 (the language framework and the switch), 40 (store shell: header, menus, footer, bottom bar, slim headers)
// and 42 (the one slider engine). Registry version 16 (~~12~~: main reached 15 first). Labels: messages/storefront.<lang>.json.
//
// What lives here is the SHAPE of the shop as data: which icons sit in the header and in what order, which links the
// menus and the footer carry, which theme is worn and when, how the sliders move. The words themselves are keys into
// the shop dictionary (apps/web/messages/shop.<lang>.json) or the owner's own text in both languages; the numbers a
// text mentions ({freeOver}, {windowHours}) are read from their own settings at the moment the text is shown.
// The defaults reproduce the approved ~~V12~~ V12.1 demo (CN-008; docs/demo/src/03-layout.js menuDefault, hdrDefault,
// ftrDefault). Every new look of V12.1 is an option and the earlier look stays selectable (owner, Note 51).
// The owner's own data (logo, slogan, opening hours, his colours, his own words) has no default (PR 509).
import { z } from 'zod';
import { setting } from './define';
import { localizedTextSchema, mediaRefSchema } from './schemas';

const V = 16;

// ---- shared value shapes ----

export const THEME_PRESET_NAMES = ['classic', 'noir', 'ivory', 'festive'] as const;
export const themePresetSchema = z.enum(THEME_PRESET_NAMES);

/** The self-hosted font families (apps/web/src/fonts) a theme may be switched to. */
export const SHOP_FONT_KEYS = ['instrument-sans', 'archivo', 'hind-siliguri', 'cormorant-garamond'] as const;

/** Icons the shell can draw (apps/web/src/components/shop/Icon.tsx draws each one; a test keeps the two lists equal). */
export const SHOP_ICONS = [
  'menu', 'search', 'bag', 'user', 'heart', 'back', 'close', 'right', 'down', 'up', 'phone', 'chat', 'mail', 'check',
  'truck', 'swap', 'lock', 'shield', 'cash', 'ruler', 'info', 'spark', 'grid', 'home', 'layers', 'tag', 'doc', 'box',
  'facebook', 'instagram', 'play', 'whatsapp', 'star', 'gift', 'globe', 'clock', 'link', 'settings', 'sun', 'eye',
  'wallet', 'bolt', 'plus', 'minus', 'share', 'edit', 'camera', 'trash',
  // CN-012 (owner Note 54, item 2): the networks' own marks for the reference desktop footer
  'youtube', 'tiktok',
] as const;
export const shopIconSchema = z.enum(SHOP_ICONS);
export type ShopIcon = (typeof SHOP_ICONS)[number];

/** A whole day in the store's time zone, `YYYY-MM-DD`. */
export const daySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'a day as YYYY-MM-DD' });

/** A short stable id inside a list (menus, footer columns, links). */
export const listIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, { message: 'a short id: lower-case letters, digits and dashes' });

/** A place inside the shop: a path such as `/help/faq` (never another site; social links have their own settings). */
export const shopPathSchema = z
  .string()
  .max(300)
  .regex(/^\/(?![/\\])[^\s<>"]*$/, { message: 'a path inside the shop, starting with /' });

/** A category's link name (the catalogue's slug). */
export const categorySlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);

/** A `#rrggbb` colour. */
export const hexColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: 'a colour like #1F4E46' });

/** Words on the page: a key of the shop dictionary (PR 503), or the owner's own text in both languages. */
export const shopLabelSchema = z.union([
  z.object({ key: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/) }).strict(),
  localizedTextSchema(160).strict(),
]);
export type ShopLabel = z.output<typeof shopLabelSchema>;

/** Conditions a line needs before it may be shown (honesty: never promise what the owner has not switched on).
 *  `signupList`: the marketing sign-up list keeps the number with its consent (PR 123 / 298); until then the footer's
 *  "Get new drops first" would thank a customer and keep nothing (CN-017 lesson: every promise in customer copy is
 *  tested end to end, or the copy goes). */
export const SHOP_REQUIREMENTS = ['cod', 'freeDelivery', 'exchange', 'whatsapp', 'hotline', 'signupList'] as const;
const requiresSchema = z.array(z.enum(SHOP_REQUIREMENTS)).max(SHOP_REQUIREMENTS.length);

const uniqueIds = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id)).size === list.length;
const UNIQUE = { message: 'every id must be unique' };

// ---- PR 82 · theme schedule, preview, the owner's colours and fonts ----

export const themeScheduleSchema = z
  .array(
    z
      .object({ preset: themePresetSchema, from: daySchema, to: daySchema })
      .strict()
      .refine((w) => w.from <= w.to, { message: 'the end day is before the start day' }),
  )
  .max(24);

export const themeColoursSchema = z
  .record(z.string().regex(/^[a-z][a-z0-9-]{0,30}$/), hexColourSchema)
  .refine((r) => Object.keys(r).length <= 60, { message: 'too many colours' });

export const themeFontsSchema = z
  .object({ body: z.enum(SHOP_FONT_KEYS).optional(), display: z.enum(SHOP_FONT_KEYS).optional() })
  .strict();

// ---- PR 501 · logo sizes ----

export const logoSizeSchema = z
  .object({ desk: z.int().min(16).max(60), phone: z.int().min(16).max(44), footer: z.int().min(16).max(60) })
  .strict();

/** H5 (CN-008) · the text logo's style on the desktop header and desktop footer: 0 = as it was, 1–10 the demo's ten. */
export const LOGO_STYLE_COUNT = 11;
export const logoStyleSchema = z.int().min(0).max(LOGO_STYLE_COUNT - 1);

// ---- PR 40 · the shell ----

export const announceSchema = z
  .object({
    on: z.boolean(),
    rotateSeconds: z.int().min(2).max(60),
    messages: z
      .array(
        z
          .object({
            id: listIdSchema,
            text: shopLabelSchema,
            href: shopPathSchema.optional(),
            start: daySchema.optional(),
            end: daySchema.optional(),
            requires: requiresSchema.optional(),
            on: z.boolean(),
          })
          .strict(),
      )
      .max(10)
      .refine(uniqueIds, UNIQUE),
  })
  .strict();

export const HEADER_ICONS = ['whatsapp', 'search', 'wish', 'account', 'bag'] as const;
export const headerSchema = z
  .object({
    icons: z
      .array(z.object({ id: z.enum(HEADER_ICONS), on: z.boolean() }).strict())
      .max(HEADER_ICONS.length)
      .refine(uniqueIds, UNIQUE),
    /** The heart on a phone when there is room for it beside the wordmark (it steps out first, R15 3.4). */
    wishOnPhone: z.boolean(),
    /** The slogan under the wordmark (owner 22:14): on, per device. */
    slogan: z.object({ on: z.boolean(), phone: z.boolean(), desk: z.boolean() }).strict(),
  })
  .strict();

export const MENU_KINDS = ['new', 'cat', 'more', 'combos', 'sets', 'setsPhone', 'journal', 'link'] as const;
const menuItemSchema = z
  .object({
    id: listIdSchema,
    kind: z.enum(MENU_KINDS),
    cat: categorySlugSchema.optional(),
    href: shopPathSchema.optional(),
    label: shopLabelSchema.optional(),
    /** The phone menu's own wording, when it differs (Sets → "Build your own set"). */
    phoneLabel: shopLabelSchema.optional(),
    icon: shopIconSchema.optional(),
    on: z.boolean(),
    desk: z.boolean(),
    phone: z.boolean(),
  })
  .strict()
  .refine((x) => x.kind !== 'cat' || Boolean(x.cat), { message: 'a category item names its category' })
  .refine((x) => x.kind !== 'link' || Boolean(x.href && x.label), { message: 'a link item needs an address and words' });

const linkSchema = z
  .object({ id: listIdSchema, href: shopPathSchema, label: shopLabelSchema, icon: shopIconSchema.optional(), on: z.boolean() })
  .strict();

export const QUICK_ITEMS = ['search', 'bag', 'wish', 'account'] as const;
export const menuSchema = z
  .object({
    items: z.array(menuItemSchema).max(60).refine(uniqueIds, UNIQUE),
    quick: z.array(z.object({ id: z.enum(QUICK_ITEMS), on: z.boolean() }).strict()).max(QUICK_ITEMS.length).refine(uniqueIds, UNIQUE),
    helpTitle: shopLabelSchema,
    help: z.array(linkSchema).max(12).refine(uniqueIds, UNIQUE),
    /** The phone bottom bar: 3–5 items shown, so every tap target stays wide (≥ 64 px on a 320 px phone). */
    bottom: z
      .array(linkSchema.extend({ icon: shopIconSchema, kind: z.enum(['page', 'bag', 'account']) }).strict())
      .max(8)
      .refine(uniqueIds, UNIQUE)
      .refine((l) => {
        const n = l.filter((x) => x.on).length;
        return n >= 3 && n <= 5;
      }, { message: 'the bottom bar shows 3 to 5 items' }),
  })
  .strict();

/**
 * H4 (CN-008) · how the desktop row is arranged. 'all' every live category in the row (the earlier row) · 'catsMore'
 * New in + the first `mainCount` categories, the rest under More (the owner's default, CN-009) · 'shop' one "Shop"
 * item listing every category, then New in · Combos · Sets · 'priority' the row keeps roomy gaps and folds the last
 * items into More. Nothing leaves the menu tree; it is only placed.
 */
export const DESK_NAV_LAYOUTS = ['all', 'catsMore', 'shop', 'priority'] as const;
/** H6 (CN-008) · 'drop' a compact list under the item with side flyouts · 'panel' the earlier full-width panel. */
export const MEGA_STYLES = ['drop', 'panel'] as const;

export const desktopNavSchema = z
  .object({
    layout: z.enum(DESK_NAV_LAYOUTS),
    /** 'catsMore': how many categories stay in the row. */
    mainCount: z.int().min(1).max(12),
    /** 'shop': the words of the one "Shop" item. */
    shopLabel: shopLabelSchema,
    megaStyle: z.enum(MEGA_STYLES),
    newIn: z.boolean(),
    combos: z.boolean(),
    sets: z.boolean(),
    journal: z.boolean(),
    /** Categories kept out of the main row (hidden ones) under "More". */
    showHidden: z.boolean(),
    /** The panel under an item (sub-categories with counts). */
    mega: z.boolean(),
    /** Hover intent before a panel opens, and the grace after the mouse leaves (D9: 150 ms / 250 ms). */
    megaEnterMs: z.int().min(0).max(2000),
    megaLeaveMs: z.int().min(0).max(2000),
  })
  .strict();

export const FOOTER_ACTIONS = ['size-guide'] as const;
const footerLinkSchema = z
  .object({
    id: listIdSchema,
    cat: categorySlugSchema.optional(),
    href: shopPathSchema.optional(),
    label: shopLabelSchema.optional(),
    icon: shopIconSchema.optional(),
    act: z.enum(FOOTER_ACTIONS).optional(),
    dev: z.enum(['desk', 'phone']).optional(),
    /** H13 · the desktop footer's shorter words ("Track order"), its place there (a number between two others), and a highlight. */
    dlabel: shopLabelSchema.optional(),
    dpos: z.number().min(-1).max(99).optional(),
    hl: z.boolean().optional(),
    on: z.boolean(),
  })
  .strict()
  .refine((l) => Boolean(l.cat) || Boolean(l.href && l.label), { message: 'a link names a category, or has an address and words' });

export const PAY_MARKS = ['bkash', 'nagad', 'visa', 'mc', 'cod', 'rocket', 'amex', 'ssl', 'upay', 'bank'] as const;
export const SOCIAL_NETWORKS = ['facebook', 'instagram', 'youtube', 'tiktok'] as const;
/** V12.2 (Note 54 #2, Note 58 A/C): the footer's social marks also carry WhatsApp (its address is `contact.whatsapp`). */
export const FOOTER_SOCIAL = [...SOCIAL_NETWORKS, 'whatsapp'] as const;

/** H13 (CN-008) · 'ref' the owner's reference layout · 'classic' the earlier desktop footer. */
export const FOOTER_DESK_STYLES = ['ref', 'classic'] as const;

export const footerSchema = z
  .object({
    deskStyle: z.enum(FOOTER_DESK_STYLES),
    /** CN-012 (Note 54, item 1): a small line icon beside every link of the reference desktop footer; off = words only (V12.1). */
    deskIcons: z.boolean(),
    promise: z
      .object({
        on: z.boolean(),
        items: z
          .array(z.object({ id: listIdSchema, icon: shopIconSchema, text: shopLabelSchema, requires: requiresSchema.optional(), on: z.boolean() }).strict())
          .max(6)
          .refine(uniqueIds, UNIQUE),
      })
      .strict(),
    join: z.object({ on: z.boolean(), requires: requiresSchema.optional() }).strict(),
    columns: z
      .array(
        z
          .object({ id: listIdSchema, title: shopLabelSchema, on: z.boolean(), links: z.array(footerLinkSchema).max(12).refine(uniqueIds, UNIQUE) })
          .strict(),
      )
      .max(5)
      .refine(uniqueIds, UNIQUE),
    contact: z.object({ whatsapp: z.boolean(), hotline: z.boolean(), hours: z.boolean() }).strict(),
    /** Which networks show and in what order; the addresses are the owner's (`social.*`, PR 509). One without its address
     * yet is shown, not linked (V12.2). */
    social: z.array(z.object({ id: z.enum(FOOTER_SOCIAL), on: z.boolean() }).strict()).max(FOOTER_SOCIAL.length).refine(uniqueIds, UNIQUE),
    pay: z
      .array(z.object({ id: z.enum(PAY_MARKS), requires: requiresSchema.optional(), on: z.boolean() }).strict())
      .max(PAY_MARKS.length)
      .refine(uniqueIds, UNIQUE),
    legal: z.object({ copyright: shopLabelSchema, ids: z.boolean() }).strict(),
    /** The desktop footer's own design (four columns + contact block, D3.18); off = the phone bands stretched. */
    desktop: z.boolean(),
  })
  .strict();

// ---- PR 503 / 84 · language ----

/** A page key for the Bengali translation gate (PR 588): `home`, `help/faq`, `collections/new-in` … */
export const pageKeySchema = z.string().regex(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/).max(120);

export const labelOverridesSchema = z
  .record(
    z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/),
    z.object({ en: z.string().trim().min(1).max(300).optional(), bn: z.string().trim().min(1).max(300).optional() }).strict(),
  )
  .refine((r) => Object.keys(r).length <= 5000, { message: 'too many words' });

// ---- PR 42 · the slider engine ----

export const sliderEngineSchema = z
  .object({
    /** Rows drift on their own (owner 19 Oct 11:39: keep the drift, snap after a hand drag). */
    autoDrift: z.boolean(),
    /** Drift speed, pixels per second (18–28 reads as a calm glide). */
    speed: z.int().min(4).max(120),
    /** How long a finger keeps a row still (C2: 4 s — long enough to aim and tap). Touch only. */
    touchHoldMs: z.int().min(500).max(20000),
    /** After keyboard focus leaves a row, how long it waits before moving again (TA-2 T4). */
    focusGraceMs: z.int().min(0).max(10000),
    /** A pointer must move this far before it counts as a drag (a click after a drag never opens the card). */
    dragStartPx: z.int().min(1).max(40),
    /** A swipe this long always moves on to the next card, never springs back. */
    swipeNextPx: z.int().min(5).max(400),
    /** Snap glide after a hand drag: shortest and longest duration. */
    snapMinMs: z.int().min(0).max(2000),
    snapMaxMs: z.int().min(0).max(4000),
    /** Quiet time that marks the end of a drag (a fling keeps moving after the finger is up). */
    settleMs: z.int().min(0).max(2000),
    wheelSettleMs: z.int().min(0).max(2000),
  })
  .strict()
  .refine((e) => e.snapMinMs <= e.snapMaxMs, { message: 'the shortest snap is longer than the longest' });

// ---- PR 41 · the home page ----

/** The home page's sections in the demo's order (20-home.js HOME_SECTIONS); the page layout builder (PR 595) edits it. */
export const HOME_SECTIONS = [
  'hero', 'festive', 'categories', 'new-in', 'sets', 'size-finder', 'flash-sale', 'shop-the-look', 'reviews', 'journal',
] as const;
export type HomeSectionId = (typeof HOME_SECTIONS)[number];

export const homeSectionsSchema = z
  .array(z.object({ id: z.enum(HOME_SECTIONS), on: z.boolean() }).strict())
  .max(HOME_SECTIONS.length)
  .refine(uniqueIds, UNIQUE);

/** A hero button's look: the translucent fill, the "sets" look (`setsLook`) or an outline. */
export const HERO_BUTTON_STYLES = ['fill', 'sets', 'line'] as const;
/** The "sets" button's background: v3 = the brand tint the owner picked (Note 1.1); the earlier looks stay selectable. */
export const HERO_SETS_LOOKS = ['current', 'v1', 'v2', 'v3', 'v4'] as const;

export const homeHeroSchema = z
  .object({
    eyebrow: shopLabelSchema,
    title: shopLabelSchema,
    /** The line under the title; on a desktop each sentence takes its own line (H1). */
    sub: shopLabelSchema,
    /** H1 · desktop only: how far (px) the hero's coloured board reaches past the text column (0 = flush). */
    shift: z.int().min(0).max(240),
    setsLook: z.enum(HERO_SETS_LOOKS),
    /** One to three buttons share the row evenly (Note 3.12). */
    buttons: z
      .array(
        z
          .object({ id: listIdSchema, on: z.boolean(), label: shopLabelSchema, href: shopPathSchema, style: z.enum(HERO_BUTTON_STYLES) })
          .strict(),
      )
      .max(3)
      .refine(uniqueIds, UNIQUE),
    /** H2 · the promise lines under the buttons, one line with a bar between them; `desk` = a desktop-only wording. */
    trust: z
      .array(
        z
          .object({
            id: listIdSchema,
            on: z.boolean(),
            icon: shopIconSchema,
            text: shopLabelSchema,
            desk: shopLabelSchema.optional(),
            requires: requiresSchema.optional(),
          })
          .strict(),
      )
      .max(3)
      .refine(uniqueIds, UNIQUE),
  })
  .strict();

export const homeCategoriesSchema = z
  .object({
    /** The most tiles shown (the demo shows every visible category that has a product). */
    max: z.int().min(1).max(24),
    href: shopPathSchema,
  })
  .strict();

export const homeNewInSchema = z
  .object({
    count: z.int().min(2).max(24),
    /** `newest` = by publish date, `rank` = the owner's own order of the products. */
    order: z.enum(['newest', 'rank']),
    href: shopPathSchema,
  })
  .strict();

export const homeReviewsSchema = z
  .object({
    /** Up to ten approved reviews slide in the row (D3.3, §56.1). */
    count: z.int().min(1).max(10),
    /** Only reviews with at least this many stars. */
    minRating: z.int().min(1).max(5),
    /** The average and the count beside the heading (shown only when there are reviews). */
    summary: z.boolean(),
    href: shopPathSchema,
  })
  .strict();

// ---- the default shapes (the V12 demo's) ----

const k = (key: string) => ({ key });

const DEFAULT_MENU: z.output<typeof menuSchema> = {
  // Categories are not named here: every visible category joins after "New in" in the catalogue's own order, so a new
  // category appears in every menu with no edit (demo menuItems()).
  items: [
    { id: 'new', kind: 'new', href: '/collections/new-in', label: k('nav.newIn'), icon: 'spark', on: true, desk: true, phone: true },
    { id: 'more', kind: 'more', label: k('nav.more'), on: true, desk: true, phone: false },
    { id: 'combos', kind: 'combos', href: '/combos', label: k('nav.combos'), on: true, desk: true, phone: false },
    { id: 'sets', kind: 'sets', href: '/combos/build-your-own', label: k('nav.sets'), phoneLabel: k('nav.buildYourOwnSet'), on: true, desk: true, phone: true },
    { id: 'sets-phone', kind: 'setsPhone', href: '/combos', label: k('nav.setsAndCombos'), on: true, desk: false, phone: true },
    // H3 (CN-008): Journal leaves the desktop row (highlighted in the footer instead); the phone menu keeps it. ~~desk: true~~
    { id: 'journal', kind: 'journal', href: '/journal', label: k('nav.journal'), icon: 'doc', on: true, desk: false, phone: true },
  ],
  quick: [
    { id: 'search', on: true },
    { id: 'bag', on: true },
    { id: 'wish', on: true },
    { id: 'account', on: true },
  ],
  helpTitle: k('menu.helpTitle'),
  help: [
    { id: 'track', href: '/account/orders', label: k('help.track'), icon: 'truck', on: true },
    { id: 'delivery', href: '/help/delivery', label: k('help.delivery'), icon: 'truck', on: true },
    { id: 'exchange', href: '/help/exchange', label: k('help.exchange'), icon: 'swap', on: true },
    { id: 'faq', href: '/help/faq', label: k('help.questions'), icon: 'info', on: true },
    { id: 'contact', href: '/help/contact', label: k('help.contactUs'), icon: 'chat', on: true },
  ],
  bottom: [
    { id: 'home', kind: 'page', href: '/', label: k('bottom.home'), icon: 'home', on: true },
    { id: 'shop', kind: 'page', href: '/collections/new-in', label: k('bottom.shop'), icon: 'grid', on: true },
    { id: 'sets', kind: 'page', href: '/combos/build-your-own', label: k('bottom.sets'), icon: 'layers', on: true },
    { id: 'bag', kind: 'bag', href: '/bag', label: k('bottom.bag'), icon: 'bag', on: true },
    { id: 'account', kind: 'account', href: '/account', label: k('bottom.account'), icon: 'user', on: true },
  ],
};

const DEFAULT_FOOTER: z.output<typeof footerSchema> = {
  deskStyle: 'ref',
  deskIcons: true,
  promise: {
    on: true,
    items: [
      { id: 'exchange', icon: 'swap', text: k('footer.promise.exchange'), requires: ['exchange'], on: true },
      { id: 'cod', icon: 'cash', text: k('footer.promise.cod'), requires: ['cod'], on: true },
      { id: 'secure', icon: 'lock', text: k('footer.promise.secure'), on: true },
      { id: 'original', icon: 'shield', text: k('footer.promise.original'), on: true },
    ],
  },
  // ~~join: { on: true }~~ CN-017 (SIM lesson): shown once the sign-up list keeps the number (PR 123 / 298)
  join: { on: true, requires: ['signupList'] },
  columns: [
    {
      id: 'shop',
      title: k('footer.col.shop'),
      on: true,
      // The demo's six: New in, the first four categories, Sets (+ Combos on a desktop). Categories by slug — the words
      // and the garment icon come from the category itself; a category that is gone or hidden just drops out.
      links: [
        { id: 'new', href: '/collections/new-in', label: k('nav.newIn'), icon: 'spark', on: true },
        { id: 'polos', cat: 'polos', on: true },
        // H13: the desktop column is New in · Polos · Shirts · Panjabi · Sets; the phone keeps every link it had.
        { id: 'tshirts', cat: 'tshirts', dev: 'phone', on: true },
        { id: 'shirts', cat: 'shirts', on: true },
        { id: 'panjabi', cat: 'panjabi', on: true },
        { id: 'sets', href: '/combos/build-your-own', label: k('nav.sets'), icon: 'layers', on: true },
        { id: 'combos', href: '/combos', label: k('nav.combos'), icon: 'tag', dev: 'desk', on: false }, // H13: ~~on: true~~
      ],
    },
    {
      id: 'help',
      title: k('footer.col.help'),
      on: true,
      links: [
        { id: 'track', href: '/account/orders', label: k('help.track'), dlabel: k('help.trackShort'), icon: 'truck', on: true },
        { id: 'size-guide', href: '/help/size-guide', label: k('help.sizeGuide'), icon: 'ruler', act: 'size-guide', on: true },
        { id: 'delivery', href: '/help/delivery', label: k('help.delivery'), icon: 'box', on: true },
        { id: 'exchange', href: '/help/exchange', label: k('help.exchange'), dlabel: k('help.exchangeShort'), icon: 'swap', on: true },
        { id: 'payment', href: '/help/payment', label: k('help.payment'), icon: 'cash', dev: 'phone', on: true },
        { id: 'faq', href: '/help/faq', label: k('help.faq'), icon: 'info', on: true },
      ],
    },
    {
      id: 'about',
      // The third column carries the store's own name (the demo's "EXTAS"): {store} in the dictionary.
      title: k('footer.col.about'),
      on: true,
      links: [
        { id: 'story', href: '/help/story', label: k('help.story'), icon: 'doc', on: true },
        { id: 'contact', href: '/help/contact', label: k('help.contact'), icon: 'phone', on: true },
        { id: 'careers', href: '/help/careers', label: k('help.careers'), icon: 'user', dev: 'phone', on: true },
        { id: 'journal', href: '/journal', label: k('nav.journal'), icon: 'doc', dpos: 0.5, hl: true, on: true },
        { id: 'privacy', href: '/help/privacy', label: k('help.privacy'), icon: 'lock', on: true },
        { id: 'terms', href: '/help/terms', label: k('help.terms'), icon: 'doc', on: true },
      ],
    },
  ],
  contact: { whatsapp: true, hotline: true, hours: true },
  social: [
    { id: 'facebook', on: true },
    { id: 'instagram', on: true },
    { id: 'youtube', on: true },
    { id: 'tiktok', on: true },
    { id: 'whatsapp', on: true },
  ],
  pay: [
    { id: 'bkash', on: true },
    { id: 'nagad', on: true },
    { id: 'visa', on: true },
    { id: 'mc', on: true },
    { id: 'cod', requires: ['cod'], on: true },
  ],
  legal: { copyright: k('footer.copyright'), ids: true },
  desktop: true,
};

export const storefrontSettings = {
  // ---- PR 82 · themes ----
  'theme.schedule': setting({
    schema: themeScheduleSchema,
    default: [],
    scope: 'store',
    valueType: 'JSON',
    group: 'theme',
    labelKey: 'theme.schedule.label',
    helpKey: 'theme.schedule.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 30,
    version: V,
  }),
  'theme.previewParam': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'theme',
    labelKey: 'theme.previewParam.label',
    helpKey: 'theme.previewParam.help',
    isOwnerData: false,
    sortOrder: 40,
    version: V,
  }),
  // ---- PR 501 · appearance: the owner's colours and fonts over the theme ----
  'theme.colours': setting({
    schema: themeColoursSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'theme',
    labelKey: 'theme.colours.label',
    helpKey: 'theme.colours.help',
    isOwnerData: true,
    isPublic: true,
    sortOrder: 50,
    version: V,
  }),
  'theme.fonts': setting({
    schema: themeFontsSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'theme',
    labelKey: 'theme.fonts.label',
    helpKey: 'theme.fonts.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 60,
    version: V,
  }),
  // ---- PR 501 · brand: the phone logo, the favicon, the short slogan (owner data) and the logo's drawn size ----
  'brand.logoPhone': setting({
    schema: mediaRefSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'MEDIA_REF',
    group: 'brand',
    labelKey: 'brand.logoPhone.label',
    helpKey: 'brand.logoPhone.help',
    isOwnerData: true,
    sortOrder: 30,
    version: V,
  }),
  'brand.favicon': setting({
    schema: mediaRefSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'MEDIA_REF',
    group: 'brand',
    labelKey: 'brand.favicon.label',
    helpKey: 'brand.favicon.help',
    isOwnerData: true,
    sortOrder: 40,
    version: V,
  }),
  'brand.sloganShort': setting({
    schema: localizedTextSchema(60).nullable(),
    default: null,
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'brand',
    labelKey: 'brand.sloganShort.label',
    helpKey: 'brand.sloganShort.help',
    isOwnerData: true,
    sortOrder: 50,
    version: V,
  }),
  'brand.logoSize': setting({
    schema: logoSizeSchema,
    default: { desk: 36, phone: 28, footer: 32 },
    scope: 'store',
    valueType: 'JSON',
    group: 'brand',
    labelKey: 'brand.logoSize.label',
    helpKey: 'brand.logoSize.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 60,
    version: V,
  }),
  // H5 (CN-008/009): all eleven text-logo styles stay selectable; 0 = the wordmark as it was. An uploaded logo wins.
  'brand.logoStyle': setting({
    schema: logoStyleSchema,
    default: 0,
    scope: 'store',
    valueType: 'INT',
    group: 'brand',
    labelKey: 'brand.logoStyle.label',
    helpKey: 'brand.logoStyle.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 65,
    version: V,
  }),
  'contact.hours': setting({
    schema: localizedTextSchema(120).nullable(),
    default: null,
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'contact',
    labelKey: 'contact.hours.label',
    helpKey: 'contact.hours.help',
    isOwnerData: true,
    sortOrder: 50,
    version: V,
  }),
  // ---- PR 40 · the shell ----
  'shell.announce': setting({
    schema: announceSchema,
    default: {
      on: true,
      rotateSeconds: 5,
      // The demo's line. It names the free-delivery amount and Cash on Delivery, so it shows only once the owner has
      // set both (BLOCKED 6): never a promise the shop has not made.
      messages: [{ id: 'free-delivery', text: k('announce.freeDeliveryCod'), requires: ['freeDelivery', 'cod'], on: true }],
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'shell',
    labelKey: 'shell.announce.label',
    helpKey: 'shell.announce.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 10,
    version: V,
  }),
  'shell.header': setting({
    schema: headerSchema,
    default: {
      icons: [
        { id: 'whatsapp', on: true },
        { id: 'search', on: true },
        { id: 'wish', on: true },
        { id: 'account', on: true },
        { id: 'bag', on: true },
      ],
      wishOnPhone: true,
      slogan: { on: true, phone: true, desk: true },
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'shell',
    labelKey: 'shell.header.label',
    helpKey: 'shell.header.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 20,
    version: V,
  }),
  'shell.menu': setting({
    schema: menuSchema,
    default: DEFAULT_MENU,
    scope: 'store',
    valueType: 'JSON',
    group: 'shell',
    labelKey: 'shell.menu.label',
    helpKey: 'shell.menu.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 30,
    version: V,
  }),
  'shell.desktopNav': setting({
    schema: desktopNavSchema,
    default: {
      layout: 'catsMore',
      mainCount: 4,
      shopLabel: k('nav.shop'),
      megaStyle: 'drop',
      newIn: true,
      combos: true,
      sets: true,
      journal: true,
      showHidden: true,
      mega: true,
      megaEnterMs: 150,
      megaLeaveMs: 250,
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'shell',
    labelKey: 'shell.desktopNav.label',
    helpKey: 'shell.desktopNav.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 40,
    version: V,
  }),
  'shell.footer': setting({
    schema: footerSchema,
    default: DEFAULT_FOOTER,
    scope: 'store',
    valueType: 'JSON',
    group: 'shell',
    labelKey: 'shell.footer.label',
    helpKey: 'shell.footer.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 50,
    version: V,
  }),
  // ---- PR 503 / 84 · language ----
  'language.bengali.enabled': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'language',
    labelKey: 'language.bengali.enabled.label',
    helpKey: 'language.bengali.enabled.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 10,
    version: V,
  }),
  'language.bengali.readyPages': setting({
    schema: z.array(pageKeySchema).max(5000),
    default: [],
    scope: 'store',
    valueType: 'JSON',
    group: 'language',
    labelKey: 'language.bengali.readyPages.label',
    helpKey: 'language.bengali.readyPages.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 20,
    version: V,
  }),
  'language.bengali.digits': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'language',
    labelKey: 'language.bengali.digits.label',
    helpKey: 'language.bengali.digits.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 30,
    version: V,
  }),
  'language.labels': setting({
    schema: labelOverridesSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'language',
    labelKey: 'language.labels.label',
    helpKey: 'language.labels.help',
    isOwnerData: true,
    isPublic: true,
    sortOrder: 40,
    version: V,
  }),
  // ---- PR 42 · the one slider engine ----
  'slider.engine': setting({
    schema: sliderEngineSchema,
    default: {
      autoDrift: true,
      speed: 22,
      touchHoldMs: 4000,
      focusGraceMs: 1500,
      dragStartPx: 5,
      swipeNextPx: 40,
      snapMinMs: 140,
      snapMaxMs: 320,
      settleMs: 140,
      wheelSettleMs: 180,
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'slider',
    labelKey: 'slider.engine.label',
    helpKey: 'slider.engine.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 10,
    version: V,
  }),
  // ---- PR 41 · the home page ----
  'home.sections': setting({
    schema: homeSectionsSchema,
    default: HOME_SECTIONS.map((id) => ({ id, on: true })),
    scope: 'store',
    valueType: 'JSON',
    group: 'home',
    labelKey: 'home.sections.label',
    helpKey: 'home.sections.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 10,
    version: V,
  }),
  'home.hero': setting({
    schema: homeHeroSchema,
    default: {
      eyebrow: k('home.hero.eyebrow'),
      title: k('home.hero.title'),
      sub: k('home.hero.sub'),
      shift: 112,
      setsLook: 'v3',
      buttons: [
        { id: 'shop', on: true, label: k('home.hero.shopNow'), href: '/collections/hoodies', style: 'fill' },
        { id: 'sets', on: true, label: k('home.hero.shopSets'), href: '/combos', style: 'sets' },
      ],
      trust: [
        { id: 'cod', on: true, icon: 'cash', text: k('home.hero.trust.cod'), requires: ['cod'] },
        { id: 'exchange', on: true, icon: 'swap', text: k('home.hero.trust.exchange'), desk: k('home.hero.trust.exchangeDesk'), requires: ['exchange'] },
      ],
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'home',
    labelKey: 'home.hero.label',
    helpKey: 'home.hero.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 20,
    version: V,
  }),
  'home.categories': setting({
    schema: homeCategoriesSchema,
    default: { max: 12, href: '/collections/new-in' },
    scope: 'store',
    valueType: 'JSON',
    group: 'home',
    labelKey: 'home.categories.label',
    helpKey: 'home.categories.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 30,
    version: V,
  }),
  'home.newIn': setting({
    schema: homeNewInSchema,
    default: { count: 8, order: 'newest', href: '/collections/new-in' },
    scope: 'store',
    valueType: 'JSON',
    group: 'home',
    labelKey: 'home.newIn.label',
    helpKey: 'home.newIn.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 40,
    version: V,
  }),
  'home.reviews': setting({
    schema: homeReviewsSchema,
    default: { count: 10, minRating: 1, summary: true, href: '/collections/new-in' },
    scope: 'store',
    valueType: 'JSON',
    group: 'home',
    labelKey: 'home.reviews.label',
    helpKey: 'home.reviews.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 50,
    version: V,
  }),
  /** H9 · the sliding rows fade at both edges (off = the earlier plain box edges). */
  'home.rowFade': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'home',
    labelKey: 'home.rowFade.label',
    helpKey: 'home.rowFade.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 60,
    version: V,
  }),
};

export type HomeHero = z.output<typeof homeHeroSchema>;
export type HomeSections = z.output<typeof homeSectionsSchema>;
export type SliderEngine = z.output<typeof sliderEngineSchema>;
export type ShellMenu = z.output<typeof menuSchema>;
export type ShellFooter = z.output<typeof footerSchema>;
export type ShellHeader = z.output<typeof headerSchema>;
export type ShellAnnounce = z.output<typeof announceSchema>;
export type DesktopNav = z.output<typeof desktopNavSchema>;
