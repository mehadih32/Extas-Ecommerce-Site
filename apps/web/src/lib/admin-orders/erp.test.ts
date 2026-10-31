// PR 610, 611 — the ERP part of an order's page: both admin languages carry the same words; the panel says why an
// order waits, shows the hold band and its warning, the ERP total only when the view carries it (the person may read
// the ERP account), "From ERP return stock", a short line's decision form only for those who may decide, the
// identification colour, and the Partial delivery box with its starting values in whole taka.
import { describe, expect, it } from 'vitest';
import type { ErpOrderView } from '@extas/inventory';
import type { PartialBoxView } from '@extas/shipping';
import bn from '../../../messages/admin-erp-orders.bn.json';
import en from '../../../messages/admin-erp-orders.en.json';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { keysOf } from '../shop/dict';
import { boxTexts, decideTexts, erpPanelView } from './erp';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const ID = '0190a0b0-0000-7000-8000-000000000001';

const ERP: ErpOrderView = {
  externalOrderId: 'T-1001',
  accepted: true,
  erpTotalMinor: 180_000,
  refusal: null,
  refusedAt: null,
  held: { reason: 'LINE_WAITING', since: '2026-10-23T05:00:00.000Z' },
  billedAt: null,
  pickedUpAt: null,
  consignmentId: null,
  identification: 'YELLOW',
  lines: [
    { lineId: 'T-1001-1', sku: 'POLO-NAVY-M', grade: 'A', customerPriceMinor: 53_300, shopPriceMinor: 60_000, fromReturnStock: true, state: 'SHORT', shortReason: 'RETURN_PIECE_FAILED_CHECK', decision: null, decisionSku: null },
    { lineId: 'T-1001-2', sku: 'POLO-NAVY-L', grade: 'A', customerPriceMinor: 53_400, shopPriceMinor: 60_000, fromReturnStock: false, state: 'OPEN', shortReason: null, decision: null, decisionSku: null },
  ],
  hold: { onHold: false, reason: null, holdsOn: '2026-10-30', daysLeft: 7, warn: true, checkoutPaused: false },
  canDecide: true,
};
const BOX: PartialBoxView = {
  required: true,
  open: true,
  courierStatus: 'PARTIALLY_DELIVERED',
  collectedMinor: 59_300,
  lines: [
    { lineId: 'T-1001-1', sku: 'POLO-NAVY-M', customerPriceMinor: 53_300, kept: false, fromReturnStock: true, state: 'OPEN' },
    { lineId: 'T-1001-2', sku: 'POLO-NAVY-L', customerPriceMinor: 53_400, kept: false, fromReturnStock: false, state: 'OPEN' },
  ],
  mark: null,
  identification: null,
  sentAt: null,
  handedBack: false,
};

describe('PR 610, 611 · the ERP part of the order page', () => {
  it('both languages carry the same words, and every code the views can give has its words', () => {
    expect(keysOf(bn).sort()).toEqual(keysOf(en).sort());
    for (const lang of ['en', 'bn'] as const) {
      for (const r of ['ACCOUNT_ON_HOLD', 'INSUFFICIENT_STOCK', 'NO_SHOP_PRICE', 'LINE_WAITING', 'B_GRADE_CLOSED']) expect(adminDicts[lang], `${lang} ${r}`).toHaveProperty(['erpOrder', 'held', r]);
      for (const s of ['OPEN', 'SHORT', 'CANCELLED', 'REMOVED']) expect(adminDicts[lang]).toHaveProperty(['erpOrder', 'lines', 'state', s]);
      for (const c of ['GREEN', 'YELLOW', 'ORANGE']) expect(adminDicts[lang]).toHaveProperty(['erpOrder', 'ident', c]);
    }
  });

  it('v5, or an order the ERP never had: nothing', () => {
    expect(erpPanelView(view('en'), ID, 'BDT', null, null)).toBeNull();
  });

  it('says why it waits, warns before the hold, marks Return stock, offers the decision on the short line only', () => {
    const v = erpPanelView(view('en'), ID, 'BDT', ERP, null)!;
    expect(v.chip).toEqual({ text: 'Waiting', tone: 'warn' });
    expect(v.held).toContain('a line is short');
    expect(v.band).toEqual({ text: 'The ERP will hold new orders on 2026-10-30 (7 days left) unless a payment reaches it.', tone: 'warn' });
    expect(v.rows.map((r) => r.label)).toEqual(['ERP order', 'ERP total (shop prices)', 'Billed', 'Courier pickup']);
    expect(v.rows[1]!.value).toBe('৳1,800');
    expect(v.identification).toMatchObject({ code: 'YELLOW', tone: 'warn' });
    expect(v.lines.map((l) => [l.fromReturn, l.state.text, l.decide, !!l.short])).toEqual([
      [true, 'Short', true, true],
      [false, 'Open', false, false],
    ]);
    expect(v.decideUrl('T-1001-1')).toBe(`/api/admin/orders/${ID}/erp/lines/T-1001-1`);
    // Without the ERP-account permission the view carries no total and no shop prices: none is shown.
    const plain = erpPanelView(view('en'), ID, 'BDT', { ...ERP, erpTotalMinor: null, canDecide: false, lines: ERP.lines.map((l) => ({ ...l, shopPriceMinor: null })) }, null)!;
    expect(plain.rows.map((r) => r.label)).not.toContain('ERP total (shop prices)');
    expect(plain.lines.every((l) => l.shop === null && !l.decide)).toBe(true);
  });

  it('the account on hold: the band says whether checkout is paused', () => {
    expect(erpPanelView(view('en'), ID, 'BDT', { ...ERP, hold: { ...ERP.hold!, onHold: true, checkoutPaused: true } }, null)!.band).toMatchObject({ tone: 'bad', text: expect.stringContaining('checkout is paused') });
    expect(erpPanelView(view('bn'), ID, 'BDT', { ...ERP, hold: { ...ERP.hold!, onHold: true, checkoutPaused: false } }, null)!.band!.text).toContain('চেকআউট খোলা');
  });

  it('the Partial delivery box: required, the courier`s figure as the starting amount in whole taka, then the saved box', () => {
    const v = erpPanelView(view('en'), ID, 'BDT', ERP, BOX)!;
    expect(v.box).toMatchObject({ required: true, open: true, url: `/api/admin/orders/${ID}/erp/partial-delivery`, start: { kept: [], paid: 593, discount: 0, phone: false }, digits: 2, collected: '৳593' });
    const saved = erpPanelView(view('en'), ID, 'BDT', ERP, { ...BOX, required: false, mark: { keptLineIds: ['T-1001-2'], paidMinor: 53_400, discountGivenMinor: 2_000, phoneConfirmed: true, note: 'kept one', at: '2026-10-24T10:00:00.000Z' } })!;
    expect(saved.box).toMatchObject({ required: false, start: { kept: ['T-1001-2'], paid: 534, discount: 20, phone: true, note: 'kept one' } });
    expect(saved.box!.last).toMatch(/^Last saved /);
    // Handed back: shown closed; before any courier result: not shown.
    expect(erpPanelView(view('en'), ID, 'BDT', ERP, { ...BOX, open: false, handedBack: true })!.box).toMatchObject({ open: false, closed: expect.any(String) });
    expect(erpPanelView(view('en'), ID, 'BDT', ERP, { ...BOX, open: false })!.box).toBeNull();
    expect(boxTexts(view('bn')).discountHint).toContain('ERP');
    expect(decideTexts(view('en')).REPLACE).toBe('Replace');
  });
});
