// PR 40 / 501 — the two ways a customer reaches the shop by phone. The numbers are the owner's (`contact.whatsapp`,
// `contact.phone`); with no number set, the buttons are left out rather than pointing nowhere.

/** wa.me wants the number as digits only, with the country code. */
export function waHref(number: string | null | undefined, text: string): string | null {
  const digits = (number ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function telHref(number: string | null | undefined): string | null {
  const n = (number ?? '').replace(/[^\d+]/g, '');
  return n ? `tel:${n}` : null;
}

/** Only https addresses leave the shop from a social link (an empty or other address is not shown). */
export function safeExternal(url: string | null | undefined): string | null {
  return url && /^https:\/\/[^\s"<>]+$/.test(url) ? url : null;
}
