// S22 · PR 624 (CN-034) — taps on the shop's support buttons, counted by day, channel and place (the rules without a
// database; the shop's click listener and @extas/support taps.ts both read them). Numbers only: which button and where,
// never who tapped it.

/** The support buttons counted: Messenger (m.me), WhatsApp (wa.me) and the call button (tel:). */
export const TAP_CHANNELS = ['messenger', 'whatsapp', 'call'] as const;
export type TapChannel = (typeof TAP_CHANNELS)[number];

/** Where on the shop the button was: the header, the phone menu, the floating WhatsApp disc, or the page's kind. */
export const TAP_PLACES = ['header', 'menu', 'fab', 'product', 'help', 'contact', 'order', 'other'] as const;
export type TapPlace = (typeof TAP_PLACES)[number];

/** How many days back the Support settings card counts (the card's own choice; at most a year). */
export const TAP_REPORT_DAYS = { default: 30, max: 366 } as const;

export const isTapChannel = (v: unknown): v is TapChannel => typeof v === 'string' && (TAP_CHANNELS as readonly string[]).includes(v);
export const isTapPlace = (v: unknown): v is TapPlace => typeof v === 'string' && (TAP_PLACES as readonly string[]).includes(v);

/** The support channel an address opens, or null for any other link. */
export function tapChannelOf(href: string | null | undefined): TapChannel | null {
  const h = (href ?? '').trim().toLowerCase();
  if (h.startsWith('tel:')) return 'call';
  const m = /^https:\/\/(?:www\.)?(m\.me|wa\.me|api\.whatsapp\.com)\//.exec(h);
  if (!m) return null;
  return m[1] === 'm.me' ? 'messenger' : 'whatsapp';
}
