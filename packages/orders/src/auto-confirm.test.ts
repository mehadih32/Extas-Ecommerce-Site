// S28 · PR 663 — the auto-confirm table's decision (pure): the order of cases, the presets, "suspicious is never auto",
// a watch order never confirms by itself, a prepaid order still waiting for money is left alone.
import { describe, expect, it } from 'vitest';
import { AUTO_CONFIRM_PRESETS, ORDERS_AUTO_CONFIRM_DEFAULT as D, ordersAutoConfirmSchema } from '@extas/settings';
import { classifyOrder, presetOf, type AutoConfirmFacts } from './auto-confirm';
import type { CourierScoreResult } from './courier-score';

const score = (s: number | null, band: 'auto' | 'call' | 'person', partial = false): CourierScoreResult => ({ score: s, band, metrics: [], partial, reason: { key: 'green', values: {} } });
const facts = (o: Partial<AutoConfirmFacts> = {}): AutoConfirmFacts => ({
  paymentMethod: 'COD',
  totalMinor: 150_000,
  paidMinor: 0,
  walletAppliedMinor: 0,
  deliveryChargeMinor: 6_000,
  riskSection: 'clear',
  delivered: 0,
  refused: 0,
  noHistory: true,
  score: null,
  ...o,
});
const cfg = { ...D, bigCodMinor: 500_000 };

describe('PR 663 — the cases', () => {
  it('paid in full online confirms; the table decides', () => {
    expect(classifyOrder(facts({ paymentMethod: 'BKASH', paidMinor: 150_000, riskSection: 'prepaid' }), cfg)).toMatchObject({ case: 'prepaid', action: 'auto', why: 'paidFull' });
    expect(classifyOrder(facts({ paymentMethod: 'BKASH', paidMinor: 150_000, riskSection: 'prepaid' }), { ...cfg, cases: { ...cfg.cases, prepaid: 'call' } })?.action).toBe('call');
  });
  it('a prepaid order still waiting for its money is left alone (null)', () => {
    expect(classifyOrder(facts({ paymentMethod: 'BKASH', paidMinor: 0 }), cfg)).toBeNull();
  });
  it('only the delivery charge paid first (a cash order)', () => {
    expect(classifyOrder(facts({ paidMinor: 6_000 }), cfg)).toMatchObject({ case: 'delivery', action: 'auto', why: 'paidCharge' });
  });
  it('suspicious sections go to a person whatever the table says, even for a paid order', () => {
    for (const s of ['duplicate', 'reorder', 'identity', 'high']) {
      expect(classifyOrder(facts({ riskSection: s }), cfg)).toMatchObject({ case: 'suspicious', action: 'person' });
    }
    expect(classifyOrder(facts({ paymentMethod: 'BKASH', paidMinor: 150_000, riskSection: 'duplicate' }), cfg)?.case).toBe('suspicious');
    // a table cell forced to auto (bypassing the schema) still never confirms
    expect(classifyOrder(facts({ riskSection: 'high' }), { ...cfg, cases: { ...cfg.cases, suspicious: 'auto' } })?.action).toBe('person');
  });
  it('refused before: call list; with the delivery charge paid first, its own case', () => {
    expect(classifyOrder(facts({ refused: 1, delivered: 5, noHistory: false }), cfg)).toMatchObject({ case: 'refused', action: 'call' });
    expect(classifyOrder(facts({ refused: 1, paidMinor: 6_000 }), cfg)).toMatchObject({ case: 'refusedPaid', action: 'auto' });
  });
  it('a big cash order goes to the call list; no limit set means no big orders', () => {
    expect(classifyOrder(facts({ totalMinor: 600_000, delivered: 9, noHistory: false }), cfg)).toMatchObject({ case: 'bigCod', action: 'call' });
    expect(classifyOrder(facts({ totalMinor: 600_000, delivered: 9, noHistory: false }), { ...cfg, bigCodMinor: null })?.case).toBe('trusted');
  });
  it('an old customer with every parcel taken is trusted; the counts are the owner', () => {
    expect(classifyOrder(facts({ delivered: 1, noHistory: false }), cfg)).toMatchObject({ case: 'trusted', action: 'auto' });
    expect(classifyOrder(facts({ delivered: 2, noHistory: false }), { ...cfg, trustedMinDelivered: 3 })?.case).not.toBe('trusted');
  });
  it('a new customer: green score confirms, middle or partly unknown calls, red is tagged, no record is brand new', () => {
    expect(classifyOrder(facts({ noHistory: false, score: score(9, 'auto') }), cfg)).toMatchObject({ case: 'goodScore', action: 'auto', why: 'scoreGreen', score: 9 });
    expect(classifyOrder(facts({ noHistory: false, score: score(6, 'call') }), cfg)).toMatchObject({ action: 'call', why: 'scoreMiddle' });
    expect(classifyOrder(facts({ noHistory: false, score: score(9, 'call', true) }), cfg)).toMatchObject({ action: 'call' });
    expect(classifyOrder(facts({ noHistory: false, score: score(2, 'person') }), cfg)).toMatchObject({ action: 'person', why: 'scoreRed' });
    expect(classifyOrder(facts({ score: score(null, 'call', true) }), cfg)).toMatchObject({ case: 'brandNew', action: 'call', why: 'noRecord' });
    expect(classifyOrder(facts({ score: null, noHistory: false }), cfg)?.case).toBe('brandNew');
  });
  it('a watch order never confirms by itself', () => {
    expect(classifyOrder(facts({ riskSection: 'watch', delivered: 3, noHistory: false }), cfg)).toMatchObject({ action: 'call', why: 'watch' });
  });
});

describe('PR 663 — presets and the setting', () => {
  it('is off as shipped with the Normal table; the presets differ as the prototype says', () => {
    expect(D.enabled).toBe(false);
    expect(presetOf(D.cases)).toBe('normal');
    expect(presetOf(AUTO_CONFIRM_PRESETS.low)).toBe('low');
    expect(presetOf(AUTO_CONFIRM_PRESETS.strict)).toBe('strict');
    expect(presetOf({ ...D.cases, bigCod: 'person' })).toBe('custom');
    expect(AUTO_CONFIRM_PRESETS.low.brandNew).toBe('auto');
    expect(AUTO_CONFIRM_PRESETS.strict.refused).toBe('person');
  });
  it('refuses a suspicious answer of "confirm by itself" and unknown fields', () => {
    expect(ordersAutoConfirmSchema.safeParse(D).success).toBe(true);
    expect(ordersAutoConfirmSchema.safeParse({ ...D, cases: { ...D.cases, suspicious: 'auto' } }).success).toBe(false);
    expect(ordersAutoConfirmSchema.safeParse({ ...D, extra: 1 }).success).toBe(false);
    expect(ordersAutoConfirmSchema.safeParse({ ...D, bigCodMinor: 0 }).success).toBe(false);
  });
});
