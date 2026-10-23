// PR 136 — what the invoice sheet shows (lib/shop/invoice.ts draws it), read from the order as it is stored (the same
// receipt the order page reads) and from settings: the shop's own details are the owner's (`store.name`, `brand.slogan`,
// `contact.*`, `legal.*`) and an empty one is simply left out — never a placeholder, never someone else's; every word
// is in the shop dictionary (`account.invoice.*`, editable through `language.labels`) or the owner's own note and
// footer (`account.invoice`). No amount is worked out here: each one is a stored figure, only written as money.
// PR 605: a gift goes "to" the receiver with "a gift from" the sender (and his note); with its prices hidden the sheet
// has no prices and no totals — only what the receiver still pays at the door, when anything is left.
import type { Receipt } from '@extas/checkout';
import type { AccountInvoiceSettings, ShopLabel } from '@extas/settings';
import { colourName } from './catalogue';
import type { ShopContext } from './context';
import { plural } from './bag-model';
import { invoiceNumber, type InvoiceRow, type InvoiceTotal, type InvoiceView } from './invoice';

/** The shop's details the invoice prints beyond the shell's own settings (read by the page with readPageSettings). */
export interface InvoiceShop {
  address: { en: string; bn: string } | null;
  registeredName: string | null;
  bin: string | null;
  exchangeSummary: ShopLabel | undefined;
}

/** A line's name in the page's language (the order keeps the English; Bengali from the product, as the order page). */
const lineName = (l: Receipt['lines'][number], lang: 'en' | 'bn') => (lang === 'bn' && l.nameBn?.trim()) || l.nameEn;

const parts = (...xs: (string | null | undefined | false)[]) => xs.filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' · ');

export function invoiceView(
  c: Pick<ShopContext, 't' | 'lang' | 'money' | 'num' | 's' | 'storeName'>,
  r: Receipt,
  set: AccountInvoiceSettings,
  shop: InvoiceShop,
  opts: { date: string; methodName: (p: { method: string | null; provider: string | null }) => string; delivered: boolean },
): InvoiceView {
  const t = c.t;
  const m = c.money;
  const b = set.blocks;
  const invoiceNo = invoiceNumber(set.number, r.number);
  const units = r.lines.reduce((s, l) => s + l.quantity, 0);
  const items = plural(t, 'account.orders.items', units, c.num);

  // ---- the shop: its wordmark and its own lines (each only when the owner has filled it in) ----
  const s = c.s;
  const shopLines = b.shopDetails
    ? [
        t.label(s['brand.slogan'] ?? undefined),
        parts(s['contact.whatsapp'] ? t('account.invoice.whatsapp', { n: s['contact.whatsapp'] }) : null, s['contact.phone'] ? t('account.invoice.phone', { n: s['contact.phone'] }) : null),
        shop.address ? (shop.address[c.lang] || shop.address.en) : null,
        s['contact.email'],
      ].filter((x): x is string => !!x && x.trim() !== '')
    : [];

  // ---- the customer's side ----
  const parties: InvoiceView['parties'] = [];
  const gift = r.gift;
  const hidden = gift?.hidePrices === true;
  if (b.customer && (r.name || r.phone)) parties.push({ label: t(gift ? 'account.invoice.giftTo' : 'account.invoice.billTo'), strong: r.name ?? undefined, lines: r.phone ? [r.phone] : [] });
  if (gift) parties.push({ label: t('account.invoice.giftFrom'), strong: gift.senderName || undefined, lines: gift.note ? [gift.note] : [] });
  if (b.address && r.address) parties.push({ label: t('account.invoice.address'), lines: [r.address] });
  if (b.courier && r.shipment) parties.push({ label: t('account.invoice.courier'), lines: [r.shipment.courier, ...(r.shipment.tracking ? [t('account.invoice.tracking', { code: r.shipment.tracking })] : [])] });

  // ---- the lines, as stored ----
  const rows: InvoiceRow[] = r.lines.map((l, i) => ({
    no: c.num(i + 1),
    name: lineName(l, c.lang),
    subs: [
      b.variant ? parts(l.colour ? colourName(l.colour, c.lang) : null, l.size) : '',
      b.sku && l.sku ? t('account.invoice.sku', { sku: l.sku }) : '',
      !hidden && l.lineDiscountMinor > 0 ? t('account.invoice.saves', { amount: m(l.lineDiscountMinor) }) : '',
    ].filter((x) => x !== ''),
    marks: b.marks ? [...(l.isAddOn ? [t('account.invoice.addOn')] : []), ...(l.setKey ? [t('account.invoice.set')] : [])] : [],
    qty: c.num(l.quantity),
    unit: m(l.unitMinor),
    amount: m(l.amountMinor),
  }));

  // ---- the money, as stored ----
  const totals: InvoiceTotal[] = hidden ? [] : [{ label: t('account.invoice.subtotal', { items }), value: m(r.subtotalMinor) }];
  if (!hidden && r.discountMinor > 0) totals.push({ label: t('account.invoice.discount'), value: `−${m(r.discountMinor)}`, kind: 'disc' });
  if (!hidden && r.walletMinor > 0) totals.push({ label: t('account.invoice.wallet'), value: `−${m(r.walletMinor)}`, kind: 'disc' });
  if (!hidden) {
    totals.push({ label: t('account.invoice.delivery'), value: !r.chargeFixed ? t('account.invoice.onCall') : r.deliveryMinor === 0 ? t('account.invoice.free') : m(r.deliveryMinor) });
    totals.push({ label: t('account.invoice.total'), value: m(r.totalMinor), kind: 'total' });
  }

  // ---- how it is paid (the amount still due, never the order total: lessons, SIM-F-001) ----
  const pay = r.pay;
  const method = pay.kind === 'cod' ? opts.methodName({ method: 'COD', provider: null }) : pay.kind === 'paid' && (pay.method === 'WALLET' || pay.paidMinor === 0) ? '' : opts.methodName(pay);
  const payLines =
    pay.kind === 'cod'
      ? [opts.delivered ? t('account.invoice.codDone') : t('account.invoice.codDue', { amount: m(pay.dueMinor) })]
      : pay.kind === 'paid'
        ? [pay.method === 'WALLET' || pay.paidMinor === 0 ? t('account.invoice.paidWallet') : t('account.invoice.paid', { amount: m(pay.paidMinor) }), ...(pay.mock ? [t('account.invoice.mock')] : [])]
        : [t(pay.kind === 'failed' ? 'account.invoice.failed' : 'account.invoice.due', { amount: m(pay.dueMinor) })];
  // a hidden-price gift says only what is still paid at the door (a part paid ahead leaves the rest to the rider)
  const payment = hidden
    ? pay.kind === 'cod' && pay.dueMinor > 0 && !opts.delivered
      ? { title: t('account.invoice.payment', { method }), lines: [t('account.invoice.codDue', { amount: m(pay.dueMinor) })] }
      : null
    : b.payment ? { title: method ? t('account.invoice.payment', { method }) : t('account.invoice.paymentNoMethod'), lines: payLines } : null;

  // ---- the owner's note and the footer: his legal details, the exchange line, his own footer (or the honest default) ----
  const own = (l: { en: string; bn: string } | null) => (l ? (l[c.lang] || l.en).split(/\n+/).map((x) => x.trim()).filter(Boolean) : []);
  const legal = parts(
    shop.registeredName,
    s['legal.tradeLicence'] ? t('account.invoice.tradeLicence', { v: s['legal.tradeLicence'] }) : null,
    s['legal.dbid'] ? t('account.invoice.dbid', { v: s['legal.dbid'] }) : null,
    shop.bin ? t('account.invoice.bin', { v: shop.bin }) : null,
  );
  const exchange = b.returnNote && s['policy.exchange.enabled'] && shop.exchangeSummary ? t.label(shop.exchangeSummary, { windowHours: c.num(s['policy.exchange.windowHours']) }) : '';
  const footer = b.footer ? [legal, exchange, ...(set.footer ? own(set.footer) : [t('account.invoice.footer')])].filter((x) => x.trim() !== '') : [];

  return {
    lang: c.lang,
    invoiceNo,
    docTitle: t('account.invoice.docTitle', { invoice: invoiceNo, store: c.storeName }),
    brand: c.storeName,
    shopLines,
    heading: t('account.invoice.title'),
    meta: [invoiceNo, t('account.invoice.orderNo', { number: r.number }), opts.date],
    parties,
    cols: {
      no: t('account.invoice.colNo'),
      item: t('account.invoice.colItem'),
      qty: t('account.invoice.colQty'),
      unit: t('account.invoice.colUnit'),
      amount: t('account.invoice.colAmount'),
    },
    rows,
    totals,
    payment,
    note: hidden ? [t('account.invoice.giftHidden'), ...own(set.note)] : own(set.note),
    footer,
    ...(hidden ? { prices: false } : {}),
  };
}

/** "Invoice INV-10042 for order #EX-10042 · 3 items · ৳ 2,400." — the line above the sheet on the page. */
export function invoiceLead(c: Pick<ShopContext, 't' | 'money' | 'num'>, r: Receipt, invoiceNo: string): string {
  const units = r.lines.reduce((s, l) => s + l.quantity, 0);
  if (r.gift?.hidePrices) return c.t('account.invoice.leadGift', { invoice: invoiceNo, number: r.number, items: plural(c.t, 'account.orders.items', units, c.num) });
  return c.t('account.invoice.lead', { invoice: invoiceNo, number: r.number, items: plural(c.t, 'account.orders.items', units, c.num), total: c.money(r.totalMinor) });
}

