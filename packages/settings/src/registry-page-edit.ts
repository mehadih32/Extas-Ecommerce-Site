// S02 · PR 600 (register "On-page edit mode"; Blueprint D10.6; owner 19 Oct 22:27–22:33) — registry version 248 (lane B,
// CN-036). `shop.pageEdit`: the on-page edit mode for the signed-in owner (super admin) only, off as shipped. While on,
// a thin bar on every shop page lets him turn Edit mode on: hover a section → outline + Edit → a side panel with that
// section's own settings; the draft shows in place, Publish writes it through the saved-looks path (PR 597), and the
// publish can be undone there. Customers never see the bar or load anything for it.
// - `phoneLight`: on a phone the panel is the light version (texts and offers only; no moving sections).
// - `askPhone`: a change made on a computer asks "Apply to phone too?"; Yes runs the automatic checks on every phone
//   size of `phones` in the browser (`checks`: no sideways scroll, nothing cut off, tap sizes, the buy button above the
//   fold) and publishes only when they pass and the owner says OK. No keeps the change to computers where the shop can
//   (a section shown or hidden); the rest stays in the draft.
// - `phones`: the phone screens checked (the 10 most used in Bangladesh as shipped, docs/qa/devices.json), every one
//   editable. The real-phone check (device farm) and the AI reviewer are not part of this setting (not built here).
// Nothing here touches a price, a discount, COD or an order: money is shown and linked to its own admin page only.
import { z } from 'zod';
import { setting } from './define';

const V = 248;

// hardcode-ok: form limits (list lengths, screen sizes a phone can have, a wait in milliseconds), not business numbers
const PHONES_MAX = 15;
const NAME_MAX = 60;

export const PAGE_EDIT_CHECKS = ['sideways', 'cut', 'taps', 'buyFold'] as const;
export type PageEditCheck = (typeof PAGE_EDIT_CHECKS)[number];

export const pageEditPhoneSchema = z.object({ name: z.string().trim().min(1).max(NAME_MAX), w: z.int().min(280).max(600), h: z.int().min(480).max(1400) }).strict();

export const pageEditSchema = z
  .object({
    /** The bar on every shop page for the signed-in owner (off: no shop page loads anything for it). */
    enabled: z.boolean(),
    /** On a phone, the panel shows texts and offers only (no moving, no numbers). */
    phoneLight: z.boolean(),
    /** A change made on a computer asks "Apply to phone too?" before Publish. */
    askPhone: z.boolean(),
    /** Which automatic phone checks run (in the owner's browser). */
    checks: z.object(Object.fromEntries(PAGE_EDIT_CHECKS.map((k) => [k, z.boolean()])) as Record<PageEditCheck, z.ZodBoolean>).strict(),
    /** A tap target's smallest width and height (px). */
    tapMinPx: z.int().min(24).max(96),
    /** An inline text link's smallest height (px). */
    inlineLinkMinPx: z.int().min(16).max(96),
    /** How long one phone preview may take to load before its check counts as failed (ms). */
    waitMs: z.int().min(2000).max(60000),
    /** The phone screens the checks run on (the owner can open any of them). */
    phones: z.array(pageEditPhoneSchema).min(1).max(PHONES_MAX),
  })
  .strict();
export type PageEdit = z.output<typeof pageEditSchema>;
export type PageEditPhone = z.output<typeof pageEditPhoneSchema>;

export const pageEditSettings = {
  'shop.pageEdit': setting({
    scope: 'store',
    schema: pageEditSchema,
    default: {
      enabled: false,
      phoneLight: true,
      askPhone: true,
      checks: { sideways: true, cut: true, taps: true, buyFold: true },
      // hardcode-ok: the device gate's tap sizes (Blueprint C1) and a page load allowance
      tapMinPx: 44,
      inlineLinkMinPx: 32,
      waitMs: 12000,
      // hardcode-ok: the 10 phone screens most used in Bangladesh (docs/qa/devices.json), editable
      phones: [
        { name: 'Low-end Android', w: 360, h: 640 },
        { name: 'Samsung S23 / Huawei', w: 360, h: 780 },
        { name: 'Samsung Galaxy A / Redmi / Realme / Vivo / Oppo', w: 360, h: 800 },
        { name: 'iPhone SE', w: 375, h: 667 },
        { name: 'Samsung Galaxy A (large)', w: 384, h: 854 },
        { name: 'iPhone 12 / 13 / 14', w: 390, h: 844 },
        { name: 'iPhone 15 / 16', w: 393, h: 852 },
        { name: 'Redmi Note / Xiaomi', w: 393, h: 873 },
        { name: 'Pixel / Motorola / Samsung S Ultra', w: 412, h: 915 },
        { name: 'iPhone 11 / XR', w: 414, h: 896 },
      ],
    },
    valueType: 'JSON',
    group: 'home',
    labelKey: 'shop.pageEdit.label',
    helpKey: 'shop.pageEdit.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 7,
    version: V,
  }),
};
