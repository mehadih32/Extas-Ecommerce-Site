// S28 · PR 740–744 (owner order 15 Nov 2026, customisation gaps group ঙ) — three shop-wide looks that had no setting yet,
// every one OFF as shipped, so the shop is unchanged until the owner turns one on (Website › Page settings):
// - `email.look`: the offer e-mail's look — the shop's logo and name at the top, a line under it, a footer line, the
//   colours, the type face and the width (messages/email-html.ts; off = the plain e-mail as before);
// - `cookie.banner`: the cookie notice at the foot of the shop's first visit — its words, buttons, place, how long a
//   choice is remembered and whether "No" stops the analytics and ad beacons for that visitor (off = no banner);
// - `app.homeScreen`: what a phone shows when a visitor adds the shop to the home screen — the name, the picture and the
//   colours (`/manifest.webmanifest`; off = no manifest, as before).
// The words in the defaults are the owner's to change on the screen; nothing here is a price, an order or a customer.
// Labels: messages/page-settings.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V = 740;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const pair = (max: number) => z.object({ en: z.string().trim().min(1).max(max), bn: z.string().trim().min(1).max(max) }).strict();

export const EMAIL_FONTS = ['sans', 'serif'] as const;

/** `email.look`: how the shop's offer e-mails are dressed (off = plain, as before). */
export const emailLookSchema = z
  .object({
    on: z.boolean(),
    /** The shop's logo (Website › Brand & menus) at the top; without one the shop's name is drawn. */
    logo: z.boolean(),
    /** A line under the logo or name (a slogan); none = nothing. */
    header: pair(120).nullable(),
    /** A line above the unsubscribe line (an address, a phone number); none = nothing. */
    footer: pair(300).nullable(),
    accent: hex,
    /** The colour around the e-mail and the colour of the e-mail's own box. */
    background: hex,
    panel: hex,
    text: hex,
    font: z.enum(EMAIL_FONTS),
    width: z.int().min(400).max(800),
  })
  .strict();
export type EmailLook = z.output<typeof emailLookSchema>;

export const COOKIE_POSITIONS = ['bottom', 'card'] as const;

/** `cookie.banner`: the notice on a visitor's first visit (off = none). */
export const cookieBannerSchema = z
  .object({
    on: z.boolean(),
    text: pair(400),
    accept: pair(30),
    /** A second button, "No thanks". */
    showDecline: z.boolean(),
    decline: pair(30),
    /** A link to the shop's cookie policy page. */
    policyLink: z.boolean(),
    /** The link's words. */
    policyLabel: pair(40),
    position: z.enum(COOKIE_POSITIONS),
    /** How long a visitor's choice is remembered before the banner asks again. */
    rememberDays: z.int().min(1).max(730),
    /** A visitor who says no is not counted by the shop's own analytics or the ad beacons. */
    declineStops: z.boolean(),
  })
  .strict();
export type CookieBanner = z.output<typeof cookieBannerSchema>;

export const APP_DISPLAYS = ['standalone', 'minimal-ui', 'browser'] as const;

/** `app.homeScreen`: the name, picture and colours when a phone adds the shop to its home screen (off = no manifest). */
export const appHomeScreenSchema = z
  .object({
    on: z.boolean(),
    /** The name under the icon; none = the shop's name. */
    name: z.string().trim().min(1).max(45).nullable(),
    /** A short name for a small icon label; none = the name cut short. */
    shortName: z.string().trim().min(1).max(12).nullable(),
    /** The icon (a square picture from the media library); none = the shop's own tab icon. */
    icon: z.uuid().nullable(),
    /** The bar colour and the opening screen's colour; none = the shop's theme background. */
    themeColour: hex.nullable(),
    backgroundColour: hex.nullable(),
    display: z.enum(APP_DISPLAYS),
  })
  .strict();
export type AppHomeScreen = z.output<typeof appHomeScreenSchema>;

const base = { scope: 'store', valueType: 'JSON', group: 'brand', isOwnerData: false, version: V } as const;

export const pageSettingsSettings = {
  'email.look': setting({
    ...base,
    schema: emailLookSchema,
    default: {
      on: false, // hardcode-ok: off as shipped, the plain e-mail stays until the owner turns the look on
      logo: true,
      header: null,
      footer: null,
      accent: '#1a1a1a', // hardcode-ok: a neutral dark accent, the owner picks his own on the screen
      background: '#f5f5f5', // hardcode-ok: a neutral page colour, the owner picks his own on the screen
      panel: '#ffffff', // hardcode-ok: a neutral box colour, the owner picks his own on the screen
      text: '#222222', // hardcode-ok: a neutral text colour, the owner picks his own on the screen
      font: 'sans',
      width: 560, // hardcode-ok: a common e-mail width in pixels, editable on the screen
    },
    labelKey: 'email.look.label',
    helpKey: 'email.look.help',
    isPublic: false,
    sortOrder: 740,
  }),
  'cookie.banner': setting({
    ...base,
    schema: cookieBannerSchema,
    default: {
      on: false, // hardcode-ok: off as shipped, no banner until the owner turns it on
      text: {
        en: 'We use cookies to keep the shop working and to see how it is used. You can say no.', // hardcode-ok: default words, the owner's to change
        bn: 'দোকান চালু রাখতে আর কেমন ব্যবহার হচ্ছে বুঝতে আমরা কুকি ব্যবহার করি। চাইলে না বলতে পারেন।', // hardcode-ok: default words, the owner's to change
      },
      accept: { en: 'Accept', bn: 'ঠিক আছে' }, // hardcode-ok: default words, the owner's to change
      showDecline: true,
      decline: { en: 'No thanks', bn: 'না, ধন্যবাদ' }, // hardcode-ok: default words, the owner's to change
      policyLink: true,
      policyLabel: { en: 'Cookie policy', bn: 'কুকি পলিসি' }, // hardcode-ok: default words, the owner's to change
      position: 'bottom',
      rememberDays: 180, // hardcode-ok: half a year before the banner asks again, editable on the screen
      declineStops: true,
    },
    labelKey: 'cookie.banner.label',
    helpKey: 'cookie.banner.help',
    isPublic: true,
    sortOrder: 741,
  }),
  'app.homeScreen': setting({
    ...base,
    schema: appHomeScreenSchema,
    default: { on: false, name: null, shortName: null, icon: null, themeColour: null, backgroundColour: null, display: 'standalone' }, // hardcode-ok: off as shipped, no manifest until the owner turns it on
    labelKey: 'app.homeScreen.label',
    helpKey: 'app.homeScreen.help',
    isPublic: true,
    sortOrder: 742,
  }),
};
