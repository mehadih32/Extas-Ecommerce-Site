// PR 136 — the invoice: its number, the sheet drawn from the order as stored (never a price worked out again), the
// shop's details only where the owner filled them in, the amount still due (never the total), both languages, and
// every word escaped.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import type { Receipt } from '@extas/checkout';
import type { ShopContext } from './context';
import { shopT } from './dict';
import { formatMoney, toBnDigits } from './lang';
import { esc, invoiceCss, invoiceDocumentHtml, invoiceFileName, invoiceNumber, invoiceSheetHtml } from './invoice';
import { invoiceLead, invoiceView, type InvoiceShop } from './invoice-view';

const SET = registry['account.invoice'].default;

function ctx(lang: 'en' | 'bn', own: Partial<Record<string, unknown>> = {}) {
  const s = {
    'brand.slogan': null,
    'contact.phone': null,
    'contact.whatsapp': null,
    'contact.email': null,
    'legal.dbid': null,
    'legal.tradeLicence': null,
    'policy.exchange.enabled': true,
    'policy.exchange.windowHours': 72,
    ...own,
  } as unknown as ShopContext['s'];
  const bn = lang === 'bn';
  return {
    t: shopT(lang),
    lang,
    money: (minor: number) => formatMoney(minor, 'BDT', lang, bn),
    num: (n: number) => (bn ? toBnDigits(String(n)) : String(n)),
    s,
    storeName: 'Sample Shop',
  };
}

const NO_SHOP: InvoiceShop = { address: null, registeredName: null, bin: null, exchangeSummary: undefined };

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    number: 'EX-10042',
    firstName: 'Rahim',
    phone: '01000-000001',
    address: 'House 1, Road 2, Sample Town',
    note: null,
    placedAt: '2026-10-20T09:30:00.000Z',
    band: null,
    addressUnclear: false,
    chargeFixed: true,
    freeDelivery: false,
    lines: [
      // stored figures on purpose that do not multiply out: the sheet must print them, never work them out again
      { id: 'a', productId: null, nameEn: 'Sample Polo', nameBn: 'স্যাম্পল পোলো', colour: { key: 'navy', hex: '#000', nameEn: 'Navy', nameBn: 'নেভি' }, size: 'M', quantity: 2, amountMinor: 270_000, setKey: 'set-1', isAddOn: false, unitMinor: 150_000, lineDiscountMinor: 30_000, sku: 'SAMPLE-P1-NAVY-M' },
      { id: 'b', productId: null, nameEn: 'Sample Socks <b>', nameBn: null, colour: null, size: null, quantity: 1, amountMinor: 25_000, setKey: null, isAddOn: true, unitMinor: 25_000, lineDiscountMinor: 0, sku: 'SAMPLE-S1' },
    ],
    subtotalMinor: 295_000,
    discountMinor: 10_000,
    deliveryMinor: 0,
    walletMinor: 5_000,
    totalMinor: 280_000,
    pay: { kind: 'cod', dueMinor: 275_000 },
    account: null,
    name: 'Rahim Uddin',
    status: 'PLACED',
    times: { confirmedAt: null, packedAt: null, handedOverAt: null, deliveredAt: null, cancelledAt: null, returnedAt: null },
    shipment: null,
    gift: null,
    ...over,
  };
}

const OPTS = { date: '20 Oct 2026, 3:30 pm', methodName: (p: { method: string | null; provider: string | null }) => (p.method === 'COD' ? 'Cash on Delivery' : (p.provider ?? p.method ?? '')), delivered: false };

describe('the invoice number (account.invoice.number)', () => {
  it('reads the order number: {digits} its digits only, {number} as it is', () => {
    expect(invoiceNumber('INV-{digits}', 'EX-10042')).toBe('INV-10042');
    expect(invoiceNumber('{number}/A', 'EX-10042')).toBe('EX-10042/A');
    expect(invoiceNumber('INV-{digits}', 'ABC')).toBe('INV-ABC');
    expect(registry['account.invoice'].schema.safeParse({ ...SET, number: 'INV-1' }).success).toBe(false);
    expect(registry['account.invoice'].schema.safeParse({ ...SET, number: 'INV-{total}' }).success).toBe(false);
  });

  it('the file name keeps only safe characters', () => {
    expect(invoiceFileName('INV-10042')).toBe('INV-10042.html');
    expect(invoiceFileName('EX 1/2"x')).toBe('EX-1-2-x.html');
    expect(invoiceFileName('///')).toBe('invoice.html');
  });
});

describe('the invoice sheet (Blueprint B2.1, demo inv_sheet)', () => {
  it('prints the stored figures of each line and of the order, never worked out again', () => {
    const v = invoiceView(ctx('en'), receipt(), SET, NO_SHOP, OPTS);
    expect(v.invoiceNo).toBe('INV-10042');
    expect(v.meta).toEqual(['INV-10042', 'Order #EX-10042', OPTS.date]);
    expect(v.rows[0]).toMatchObject({ no: '1', name: 'Sample Polo', qty: '2', unit: formatMoney(150_000, 'BDT', 'en', false), amount: formatMoney(270_000, 'BDT', 'en', false) });
    expect(v.rows[0]!.subs).toEqual(['Navy · M', `saves ${formatMoney(30_000, 'BDT', 'en', false)}`]);
    expect(v.rows[0]!.marks).toEqual(['set price']);
    expect(v.rows[1]!.marks).toEqual(['added to parcel']);
    const tot = Object.fromEntries(v.totals.map((x) => [x.label, x.value]));
    expect(tot).toEqual({
      'Subtotal (3 items)': formatMoney(295_000, 'BDT', 'en', false),
      'Offers & codes': `−${formatMoney(10_000, 'BDT', 'en', false)}`,
      'Wallet credit': `−${formatMoney(5_000, 'BDT', 'en', false)}`,
      Delivery: 'Free',
      Total: formatMoney(280_000, 'BDT', 'en', false),
    });
  });

  it('the payment line reads the amount still due, never the order total (lessons: SIM-F-001)', () => {
    const cod = invoiceView(ctx('en'), receipt(), SET, NO_SHOP, OPTS).payment!;
    expect(cod.title).toBe('Payment · Cash on Delivery');
    expect(cod.lines).toEqual([`Pay ${formatMoney(275_000, 'BDT', 'en', false)} in cash when the parcel reaches you.`]);
    expect(invoiceView(ctx('en'), receipt(), SET, NO_SHOP, { ...OPTS, delivered: true }).payment!.lines).toEqual(['Paid in cash on delivery.']);
    const paid = invoiceView(ctx('en'), receipt({ pay: { kind: 'paid', paidMinor: 280_000, method: 'CARD', provider: 'visa', mock: true } }), SET, NO_SHOP, OPTS).payment!;
    expect(paid).toEqual({ title: 'Payment · visa', lines: [`Paid ${formatMoney(280_000, 'BDT', 'en', false)}.`, 'Test payment — no real money was taken.'] });
    const wallet = invoiceView(ctx('en'), receipt({ pay: { kind: 'paid', paidMinor: 0, method: 'WALLET', provider: null, mock: false } }), SET, NO_SHOP, OPTS).payment!;
    expect(wallet).toEqual({ title: 'Payment', lines: ['Paid from the wallet.'] });
    const part = invoiceView(ctx('en'), receipt({ pay: { kind: 'due', dueMinor: 50_000, method: 'BKASH', provider: 'bkash' } }), SET, NO_SHOP, OPTS).payment!;
    expect(part.lines).toEqual([`${formatMoney(50_000, 'BDT', 'en', false)} still to pay.`]);
    expect(invoiceView(ctx('en'), receipt({ pay: { kind: 'failed', dueMinor: 50_000, method: 'BKASH', provider: 'bkash' } }), SET, NO_SHOP, OPTS).payment!.lines[0]).toMatch(/did not go through/);
  });

  it('PR 605: a gift goes to the receiver, from the sender; with prices hidden no price, saving or total is printed', () => {
    const gift = { senderName: 'Rafiq', note: 'Happy Eid', deliverAfter: '2026-11-02', hidePrices: true };
    const paid = receipt({ gift, pay: { kind: 'paid', paidMinor: 280_000, method: 'BKASH', provider: 'bkash', mock: false } });
    const v = invoiceView(ctx('en'), paid, SET, NO_SHOP, OPTS);
    expect(v.parties.slice(0, 2)).toEqual([
      { label: 'Deliver to', strong: 'Rahim Uddin', lines: ['01000-000001'] },
      { label: 'A gift from', strong: 'Rafiq', lines: ['Happy Eid'] },
    ]);
    expect(v.prices).toBe(false);
    expect(v.totals).toEqual([]);
    expect(v.payment).toBeNull();
    expect(v.rows[0]!.subs).toEqual(['Navy · M']);
    const html = invoiceSheetHtml(v);
    for (const minor of [150_000, 270_000, 280_000, 30_000]) expect(html).not.toContain(formatMoney(minor, 'BDT', 'en', false));
    expect(html).toContain('This is a gift: prices are not shown.');
    expect(invoiceLead(ctx('en'), paid, v.invoiceNo)).not.toContain(formatMoney(280_000, 'BDT', 'en', false));
    // a part paid ahead leaves the rest to the rider: only that is said
    const part = invoiceView(ctx('en'), receipt({ gift }), SET, NO_SHOP, OPTS);
    expect(part.payment).toEqual({ title: 'Payment · Cash on Delivery', lines: [`Pay ${formatMoney(275_000, 'BDT', 'en', false)} in cash when the parcel reaches you.`] });
    // prices shown when he left the box unticked
    const shown = invoiceView(ctx('en'), receipt({ gift: { ...gift, hidePrices: false } }), SET, NO_SHOP, OPTS);
    expect(shown.prices).toBeUndefined();
    expect(shown.totals.length).toBeGreaterThan(0);
  });

  it('a delivery charge still to be confirmed says so, never ৳0', () => {
    const v = invoiceView(ctx('en'), receipt({ chargeFixed: false }), SET, NO_SHOP, OPTS);
    expect(v.totals.find((x) => x.label === 'Delivery')!.value).toBe('Confirmed on the call');
  });

  it("the shop's details: none of the owner's until he fills them in, and an empty one leaves no label behind", () => {
    const bare = invoiceView(ctx('en'), receipt(), SET, NO_SHOP, OPTS);
    expect(bare.brand).toBe('Sample Shop');
    expect(bare.shopLines).toEqual([]);
    expect(bare.footer).toEqual(['Computer-generated invoice, no signature needed.']);
    const html = invoiceSheetHtml(bare);
    for (const gap of ['BIN', 'DBID', 'Trade licence', 'WhatsApp', 'undefined', 'null']) expect(html).not.toContain(gap);

    const own = ctx('en', { 'brand.slogan': { en: 'Menswear', bn: 'মেনসওয়্যার' }, 'contact.whatsapp': '+8801000000001', 'contact.email': 'shop@example.test', 'legal.dbid': 'DB-1' });
    const shop: InvoiceShop = { address: { en: 'Sample Road, Sample Town', bn: 'স্যাম্পল রোড' }, registeredName: 'Sample Trading', bin: '000-111', exchangeSummary: { en: 'Size exchange within {windowHours} hours.', bn: '{windowHours} ঘণ্টার মধ্যে সাইজ বদল।' } };
    const full = invoiceView(own, receipt(), { ...SET, footer: { en: 'Thank you.\nVisit again.', bn: 'ধন্যবাদ।' }, note: { en: 'Gift wrap inside.', bn: 'ভেতরে গিফট র‍্যাপ।' } }, shop, OPTS);
    expect(full.shopLines).toEqual(['Menswear', 'WhatsApp +8801000000001', 'Sample Road, Sample Town', 'shop@example.test']);
    expect(full.footer).toEqual(['Sample Trading · DBID DB-1 · BIN 000-111', 'Size exchange within 72 hours.', 'Thank you.', 'Visit again.']);
    expect(full.note).toEqual(['Gift wrap inside.']);
  });

  it('the exchange line follows the shop: none while exchanges are off', () => {
    const shop: InvoiceShop = { ...NO_SHOP, exchangeSummary: { en: 'Size exchange within {windowHours} hours.', bn: '{windowHours} ঘণ্টা' } };
    expect(invoiceView(ctx('en', { 'policy.exchange.enabled': false }), receipt(), SET, shop, OPTS).footer).toEqual(['Computer-generated invoice, no signature needed.']);
  });

  it('the parts the owner leaves out are not drawn', () => {
    const off = { ...SET, blocks: { ...SET.blocks, customer: false, address: false, variant: false, marks: false, payment: false, footer: false, sku: true } };
    const v = invoiceView(ctx('en'), receipt({ shipment: { courier: 'Sample Courier', tracking: 'TRK-1', status: 'IN_TRANSIT' } }), off, NO_SHOP, OPTS);
    expect(v.parties).toEqual([{ label: 'Courier', lines: ['Sample Courier', 'Tracking TRK-1'] }]);
    expect(v.rows[0]!.subs).toEqual(['Code SAMPLE-P1-NAVY-M', `saves ${formatMoney(30_000, 'BDT', 'en', false)}`]);
    expect(v.rows[0]!.marks).toEqual([]);
    expect(v.payment).toBeNull();
    expect(v.footer).toEqual([]);
    expect(invoiceSheetHtml(v)).not.toContain('class="pay"');
  });

  it('in Bengali: the words, the names and the digits', () => {
    const c = ctx('bn');
    const v = invoiceView(c, receipt(), SET, NO_SHOP, OPTS);
    expect(v.lang).toBe('bn');
    expect(v.heading).toBe('ইনভয়েস');
    expect(v.rows[0]).toMatchObject({ no: '১', name: 'স্যাম্পল পোলো', qty: '২' });
    expect(v.rows[0]!.subs[0]).toBe('নেভি · M');
    expect(v.rows[1]!.name).toBe('Sample Socks <b>');
    expect(v.footer).toEqual(['কম্পিউটারে তৈরি ইনভয়েস, সই লাগে না।']);
    expect(invoiceLead(c, receipt(), v.invoiceNo)).toContain('INV-10042');
    expect(invoiceSheetHtml(v)).toContain('lang="bn"');
  });

  it('every word is escaped, and the file is one self-contained document', () => {
    const v = invoiceView(ctx('en'), receipt({ name: 'A <script>x</script>' }), SET, NO_SHOP, OPTS);
    const html = invoiceSheetHtml(v);
    expect(html).toContain('A &lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('Sample Socks &lt;b&gt;');
    expect(html).not.toContain('<script>');
    expect(esc(`"'&`)).toBe('&quot;&#39;&amp;');
    const doc = invoiceDocumentHtml(v);
    expect(doc.startsWith('<!doctype html><html lang="en">')).toBe(true);
    expect(doc).toContain('<title>Invoice INV-10042 · Sample Shop</title>');
    expect(doc).toContain('<meta name="robots" content="noindex">');
    expect(doc).not.toMatch(/<link|<script|src=/);
    // the table head repeats on every printed page (B2.4)
    expect(invoiceCss('body', '')).toContain('thead{display:table-header-group}');
    expect(invoiceCss('.inv-doc', '.inv-doc ')).toContain('.inv-doc .sheet{');
  });
});
