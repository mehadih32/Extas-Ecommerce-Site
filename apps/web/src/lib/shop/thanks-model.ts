// PR 126 · follow-up 58 (demo 52-thanks.js ty_timeline): "What happens next" on the thank-you page — placed (with when,
// in the store's time zone), we confirm and pack it, handed to the courier, delivered (the band's promise, or that we
// call first). Only the first step is done when the page is drawn; nothing promises a message the shop does not send.
// Pure.

export interface NextStep {
  key: 'placed' | 'confirm' | 'courier' | 'delivered';
  title: string;
  note: string | null;
  state: 'done' | 'now' | 'later';
}

/** When the order was placed, as the page writes it: "23 Oct, 2:30 pm" in the store's time zone and the page's digits. */
export function placedText(iso: string, timeZone: string, lang: 'en' | 'bn', bnDigits: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const locale = lang === 'bn' ? (bnDigits ? 'bn-BD' : 'bn-BD-u-nu-latn') : 'en-GB';
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
  } catch {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
  }
}

export function nextSteps(words: { placed: string; confirm: string; courier: string; delivered: string }, placed: string, promise: string | null): NextStep[] {
  return [
    { key: 'placed', title: words.placed, note: placed || null, state: 'done' },
    { key: 'confirm', title: words.confirm, note: null, state: 'now' },
    { key: 'courier', title: words.courier, note: null, state: 'later' },
    { key: 'delivered', title: words.delivered, note: promise, state: 'later' },
  ];
}
