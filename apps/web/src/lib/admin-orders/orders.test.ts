// S05 · PR 140 (and 141, 152, 154) — the order screens without a database: both languages carry the same keys and none
// overlaps another admin file, every state, view, method and channel the screens show has its words, the list's address
// is read and written back the same, and the four status chips stay four separate chips.
import { describe, expect, it } from 'vitest';
import * as od from '@extas/orders';
import { ORDER_STATES } from '@extas/orders/pure';
import adminBn from '../../../messages/admin.bn.json';
import productsBn from '../../../messages/admin-products.bn.json';
import toolsBn from '../../../messages/admin-tools.bn.json';
import stockBn from '../../../messages/admin-stock.bn.json';
import rulesBn from '../../../messages/admin-rules.bn.json';
import combosBn from '../../../messages/admin-combos.bn.json';
import serverBn from '../../../messages/admin-server.bn.json';
import shellBn from '../../../messages/admin-shell.bn.json';
import bn from '../../../messages/admin-orders.bn.json';
import en from '../../../messages/admin-orders.en.json';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { t, type Dict } from '../i18n';
import { FILTER_STATES, flagChips, parseListQuery, phoneText, statusChips } from './list';
import { LIST_PAGES, ORDER_TONE, PAY_TONE, SHIP_TONE, latinDigits, listHref } from './model';

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const UUID = '01a16af2-30f0-7462-aab8-719bb3ce51b1';

describe('order screens messages', () => {
  it('both languages have the same keys, none empty; English has no Bengali', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
    for (const k of keys(bn as Dict)) {
      expect(t(bn as Dict, k), k).not.toBe('');
      expect(/[ঀ-৿]/.test(t(en as Dict, k)), k).toBe(false);
    }
  });

  it('no key is also in another admin file (the merge would hide one)', () => {
    const taken = new Set([adminBn, productsBn, toolsBn, stockBn, rulesBn, combosBn, serverBn, shellBn].flatMap((o) => keys(o as Dict)));
    expect(keys(bn as Dict).filter((k) => taken.has(k))).toEqual([]);
  });

  it('every state, view, method, channel and chip the screens show has its words', () => {
    for (const d of [adminDicts.bn, adminDicts.en]) {
      const has = (k: string) => expect(t(d, k), k).not.toBe(k);
      for (const s of ORDER_STATES) has(`orders.st.${s}`);
      for (const v of od.ORDER_VIEWS) has(`orders.view.${v}`);
      for (const m of od.PAYMENT_METHODS) has(`orders.method.${m}`);
      for (const s of od.ORDER_SOURCES) has(`orders.source.${s}`);
      for (const s of Object.keys(SHIP_TONE)) has(`orders.ship.${s}`);
      for (const p of Object.keys(PAY_TONE)) has(`orders.pay.${p}`);
      for (const r of ['REFUND_APPROVED', 'REFUND_REQUESTED', 'RETURN_EXPECTED', 'RETURN_RECEIVED', 'REFUND_DONE']) has(`orders.ret.${r}`);
    }
  });
});

describe('the list address', () => {
  it('a page shows only the order service’s own views', () => {
    for (const p of Object.values(LIST_PAGES)) for (const v of p.views) expect(od.ORDER_VIEWS).toContain(v);
  });

  it('reads the choices and drops what the service does not know', () => {
    expect(parseListQuery('all', {})).toEqual({ view: 'all', q: undefined, status: undefined, payment: undefined, source: undefined, cursor: undefined });
    const q = parseListQuery('all', { view: 'onHold', q: '  0171 ', status: 'PLACED', payment: 'BKASH', source: 'PHONE', cursor: UUID });
    expect(q).toEqual({ view: 'onHold', q: '0171', status: 'PLACED', payment: 'BKASH', source: 'PHONE', cursor: UUID });
    const bad = parseListQuery('all', { view: 'secret', status: 'DRAFT', payment: 'GOLD', source: 'x', cursor: 'not-a-uuid', q: 'x'.repeat(200) });
    expect(bad).toMatchObject({ view: 'all', status: undefined, payment: undefined, source: undefined, cursor: undefined });
    expect(bad.q).toHaveLength(80);
    expect(parseListQuery('confirm', { view: 'all' }).view).toBe('toConfirm');
    expect(FILTER_STATES).not.toContain('DRAFT');
  });

  it('writes a clean link back (the default view and empty choices left out, a new choice starts at page one)', () => {
    expect(listHref('all', { view: 'all' })).toBe('/admin/orders');
    expect(listHref('all', { view: 'all', q: 'QA-1', cursor: UUID }, { view: 'onHold' })).toBe('/admin/orders?view=onHold&q=QA-1');
    expect(listHref('all', { view: 'onHold', payment: 'COD' }, { cursor: UUID })).toBe(`/admin/orders?view=onHold&payment=COD&cursor=${UUID}`);
    expect(listHref('confirm', { view: 'toConfirm' })).toBe('/admin/orders/confirm');
    const q = parseListQuery('all', Object.fromEntries(new URL(`http://x${listHref('all', { view: 'cancelPending', status: 'HANDED_OVER', source: 'WEBSITE' })}`).searchParams));
    expect(q).toMatchObject({ view: 'cancelPending', status: 'HANDED_OVER', source: 'WEBSITE' });
  });

  it('Bengali digits are searched as Latin ones', () => {
    expect(latinDigits('অর্ডার ১০০১ ০১৭১২')).toBe('অর্ডার 1001 01712');
  });
});

describe('the row’s chips', () => {
  const row: od.OrderRow = {
    id: UUID,
    number: 'EX-1001',
    status: 'ON_HOLD',
    version: 3,
    placedAt: new Date('2026-10-23T08:00:00Z'),
    customerName: 'Rahim',
    phone: '+8801712345678',
    itemCount: 2,
    totalMinor: 315000,
    dueMinor: 315000,
    currency: 'BDT',
    paymentMethod: 'COD',
    source: 'PHONE',
    payment: 'COD_TO_COLLECT',
    holdReasonCode: 'customer-wait',
    cancelReasonCode: null,
    cancelRequested: true,
    cancelPending: false,
    customerWantsChange: false,
    inReview: true,
    flags: [],
    internalFlags: ['vip'],
    orderGroupId: null,
  };

  it('four separate statuses: order, courier, payment, and return/refund only when there is one', () => {
    const v = view('en');
    const none = statusChips(v, row, undefined);
    expect(none.map((c) => c.label)).toEqual(['On hold', 'Not booked', 'COD to collect']);
    const booked = statusChips(v, { ...row, status: 'HANDED_OVER', cancelPending: true }, { shipment: { status: 'CANCEL_REQUESTED', trackingCode: 'T1', courierName: 'X' }, returnRefund: 'REFUND_REQUESTED', units: 1, firstItem: null, lines: 1 });
    expect(booked.map((c) => c.label)).toEqual(['Handed over', 'Cancel pending courier', 'Cancel requested', 'COD to collect', 'Refund requested']);
    expect(booked.map((c) => c.tone)).toEqual([ORDER_TONE.HANDED_OVER, 'warn', SHIP_TONE.CANCEL_REQUESTED, PAY_TONE.COD_TO_COLLECT, 'warn']);
    expect(statusChips(view('bn'), row, undefined)[0]!.label).toBe(t(adminDicts.bn, 'orders.st.ON_HOLD'));
  });

  it('flags say what to notice, with the owner’s own words for hold reasons and flags', () => {
    const labels = { holdReasons: new Map([['customer-wait', 'Customer asked to wait']]), flags: new Map([['vip', 'Valued customer']]) };
    const f = flagChips(view('en'), row, labels).map((c) => c.label);
    expect(f).toEqual(['Cancel request', 'Duplicate review', 'On hold: Customer asked to wait', 'Valued customer', 'Phone order']);
    expect(flagChips(view('en'), { ...row, status: 'PLACED', cancelRequested: false, inReview: false, internalFlags: ['gone'], source: 'WEBSITE' }, labels).map((c) => c.label)).toEqual(['gone']);
  });

  it('the phone is said back the way the team reads it', () => {
    expect(phoneText('+8801712345678')).toBe('01712-345678');
    expect(phoneText(null)).toBe('');
  });
});
