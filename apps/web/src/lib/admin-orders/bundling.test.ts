// S06 · PR 522 — one parcel for one person's orders, on the order screens without a database: the list shows "One parcel?"
// only while the order is marked and not yet in a parcel; the order page's "One parcel" button exists only for a marked,
// ungrouped order that can still share a parcel and a person holding `orders.merge`; it sends only the order (the server
// finds the other orders again), says money and the status stay, and never cancels or blocks anyone. Made-up values.
import { describe, expect, it } from 'vitest';
import type * as od from '@extas/orders';
import { BUNDLE_FLAG } from '@extas/orders';
import bn from '../../../messages/admin-orders.bn.json';
import en from '../../../messages/admin-orders.en.json';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { bundleSpec } from './detail';
import { flagChips } from './list';
import { bodyOf } from './spec';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const ID = '01a16af2-30f0-7462-aab8-719bb3ce5222';
const o = { id: ID, number: 'EX-2002', flags: [BUNDLE_FLAG], orderGroupId: null as string | null, status: 'PLACED' as od.OrderState };
const merge = new Set(['orders.merge']);

describe('PR 522 · one parcel on the order screens', () => {
  it('the list chip shows only while marked and not yet in a parcel', () => {
    const row = { status: 'PLACED', cancelRequested: false, inReview: false, holdReasonCode: null, customerWantsChange: false, orderGroupId: null, internalFlags: [], source: 'WEBSITE', flags: [BUNDLE_FLAG] } as unknown as od.OrderRow;
    const labels = { holdReasons: new Map<string, string>(), flags: new Map<string, string>() };
    expect(flagChips(view('en'), row, labels).map((c) => c.label)).toEqual(['One parcel?']);
    expect(flagChips(view('bn'), row, labels).map((c) => c.label)).toEqual(['এক পার্সেল?']);
    const grouped = flagChips(view('en'), { ...row, orderGroupId: 'g1' }, labels).map((c) => c.label);
    expect(grouped).not.toContain('One parcel?');
  });

  it('"One parcel" only for a marked, open, ungrouped order and a person with orders.merge; it sends only the order', () => {
    const s = bundleSpec(view('en'), o, 'EX-2000, EX-2001', merge);
    expect(s).toMatchObject({ id: 'bundle', label: 'One parcel', url: '/api/admin/risk/bundle', version: null, okTone: 'pri' });
    expect(bodyOf(s!, { note: '' })).toEqual({ orderId: ID });
    expect(bodyOf(s!, { note: 'pack together' })).toEqual({ orderId: ID, note: 'pack together' });
    const fx = s!.effects.join(' ');
    expect(fx).toContain('EX-2000, EX-2001');
    expect(fx).toContain(en.orders.eff.bundleMoney);
    expect(fx).toContain(en.orders.eff.bundleNever);
    expect(bundleSpec(view('en'), o, '', new Set())).toBeNull();
    expect(bundleSpec(view('en'), { ...o, flags: [] }, '', merge)).toBeNull();
    expect(bundleSpec(view('en'), { ...o, orderGroupId: 'g1' }, '', merge)).toBeNull();
    expect(bundleSpec(view('en'), { ...o, status: 'SHIPPED' as od.OrderState }, '', merge)).toBeNull();
    expect(bundleSpec(view('bn'), o, 'EX-2000', merge)!.label).toBe(bn.orders.cmd.bundle.label);
  });

  it('every bundling word exists in English and Bengali', () => {
    for (const d of [en.orders, bn.orders]) {
      expect(d.flag.bundle && d.band.bundle && d.cmd.bundle.label && d.eff.bundleWith && d.dlg.bundleNote && d.courier.together && d.courier.parcelNote).toBeTruthy();
      expect(d.ev.order_bundleProposal && d.ev.order_bundled && d.ev.bundleWith && d.ev.bundleAuto).toBeTruthy();
      expect(Object.keys(d.rr.bd).sort()).toEqual(Object.keys(en.orders.rr.bd).sort());
    }
  });
});
