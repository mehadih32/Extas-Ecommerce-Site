// S02 · PR 80 follow-up 679 (demo 50-bag.js bag_waMessage, Blueprint D4.1 `bag.waSendBag`, off) — "Send my bag on
// WhatsApp": the bag written as one message — each line with its colour, size, quantity and amount, each set with its
// pieces, the bag's total and whether delivery is free — in the page's language, every word from the shop dictionary
// (bag.waSend.*). The customer reads it in a preview and sends it himself from WhatsApp; nothing is sent by the shop.
// Pure: no database, no browser.
import type { BagView } from '@extas/cart';
import { colourName, productName } from './catalogue';
import type { ShopLang } from './lang';

export interface WaWords {
  t: (key: string, vars?: Record<string, string | number>) => string;
  money: (minor: number) => string;
  num: (n: number) => string;
  lang: ShopLang;
  store: string;
}

const join = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join(', ');

/** The bag as a WhatsApp message, ready for the customer to send (one line per item, a set with its pieces). */
export function bagWaMessage(view: Pick<BagView, 'items' | 'sets' | 'summary'>, w: WaWords): string {
  const out = [w.t('bag.waSend.hello', { store: w.store }), ''];
  let n = 0;
  for (const s of view.sets) {
    n++;
    out.push(`${w.num(n)}. ${productName(s, w.lang)} — ${w.money(s.payMinor)}`);
    for (const p of s.pieces)
      out.push(`    • ${[productName(p, w.lang), join(p.colour ? colourName(p.colour, w.lang) : null, p.size)].filter(Boolean).join(' — ')}`);
  }
  for (const i of view.items) {
    n++;
    const what = join(i.colour ? colourName(i.colour, w.lang) : null, i.size?.label);
    out.push(`${w.num(n)}. ${productName(i, w.lang)}${what ? ` — ${what}` : ''} × ${w.num(i.quantity)} — ${w.money(i.lineMinor)}`);
  }
  out.push('');
  out.push(w.t(view.summary.freeDelivery ? 'bag.waSend.totalFree' : 'bag.waSend.total', { amount: w.money(view.summary.totalMinor) }));
  out.push('');
  out.push(w.t('bag.waSend.please'));
  return out.join('\n');
}
