// PR 165 — the payment model without a database: every legal and illegal move of a payment row, the money status that
// only moves forward, the amount due and what the rider collects (SIM-F-001), the payment pill, and the reason codes
// (SIM-F-028: a mismatch always has one, and the settings' list is the same list).
import { PAYMENT_MISMATCH_CODES } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import {
  codToCollect,
  dueOf,
  legalPaymentMoves,
  MISMATCH_REASONS,
  moneyForward,
  PAYMENT_STATES,
  paymentMismatch,
  paymentMove,
  paymentPill,
  type MoneyFacts,
} from './pure';

describe('PR 165 · payment row moves', () => {
  it('moves forward only: INITIATED → PENDING → AUTHORIZED → PAID / FAILED / CANCELLED', () => {
    expect(legalPaymentMoves('system')).toEqual([
      { from: 'INITIATED', to: 'PENDING' },
      { from: 'INITIATED', to: 'AUTHORIZED' },
      { from: 'INITIATED', to: 'PAID' },
      { from: 'INITIATED', to: 'FAILED' },
      { from: 'INITIATED', to: 'CANCELLED' },
      { from: 'PENDING', to: 'AUTHORIZED' },
      { from: 'PENDING', to: 'PAID' },
      { from: 'PENDING', to: 'FAILED' },
      { from: 'PENDING', to: 'CANCELLED' },
      { from: 'AUTHORIZED', to: 'PAID' },
      { from: 'AUTHORIZED', to: 'FAILED' },
      { from: 'AUTHORIZED', to: 'CANCELLED' },
    ]);
    expect(legalPaymentMoves('staff')).toEqual(legalPaymentMoves('system'));
  });

  it('a final payment never opens again; PAID never becomes FAILED', () => {
    for (const from of ['PAID', 'FAILED', 'CANCELLED'] as const)
      for (const to of ['INITIATED', 'PENDING', 'AUTHORIZED'] as const) expect(paymentMove(from, to, 'gateway')).toEqual({ ok: false, code: 'ILLEGAL_PAYMENT_MOVE' });
    expect(paymentMove('PAID', 'FAILED', 'gateway').ok).toBe(false);
    expect(paymentMove('PAID', 'CANCELLED', 'system').ok).toBe(false);
  });

  it('only the gateway turns a closed payment into PAID, and that is marked late', () => {
    expect(paymentMove('CANCELLED', 'PAID', 'gateway')).toEqual({ ok: true, same: false, late: true });
    expect(paymentMove('FAILED', 'PAID', 'gateway')).toEqual({ ok: true, same: false, late: true });
    expect(paymentMove('FAILED', 'PAID', 'staff').ok).toBe(false);
    expect(paymentMove('CANCELLED', 'PAID', 'system').ok).toBe(false);
  });

  it('the same state again is a repeat; REFUNDED and PARTIALLY_REFUNDED are never set', () => {
    for (const s of PAYMENT_STATES.filter((x) => x !== 'REFUNDED' && x !== 'PARTIALLY_REFUNDED')) expect(paymentMove(s, s, 'gateway')).toEqual({ ok: true, same: true, late: false });
    for (const from of PAYMENT_STATES) {
      expect(paymentMove(from, 'REFUNDED', 'staff')).toEqual({ ok: false, code: 'DERIVED_STATE' });
      expect(paymentMove(from, 'PARTIALLY_REFUNDED', 'gateway')).toEqual({ ok: false, code: 'DERIVED_STATE' });
    }
  });
});

describe('PR 165 · money status', () => {
  it('only moves forward: a late event never un-reconciles money', () => {
    expect(moneyForward(null, 'PROVISIONAL')).toBe('PROVISIONAL');
    expect(moneyForward('PROVISIONAL', 'RECONCILED')).toBe('RECONCILED');
    expect(moneyForward('RECONCILED', 'PROVISIONAL')).toBe('RECONCILED');
    expect(moneyForward('FINAL', 'ESTIMATED')).toBe('FINAL');
  });
});

describe('PR 165 · the amount due and the door amount (SIM-F-001)', () => {
  const cod = { paymentMethod: 'COD', totalMinor: 123_000, walletAppliedMinor: 0, paidMinor: 0 };
  it('COD collects the whole due; prepaid collects nothing; part-paid collects the rest; the wallet counts too', () => {
    expect(codToCollect(cod)).toBe(123_000);
    expect(codToCollect({ ...cod, paymentMethod: 'BKASH', paidMinor: 123_000 })).toBe(0);
    // a prepaid order whose payment failed is still not collected at the door (it is not a COD order)
    expect(codToCollect({ ...cod, paymentMethod: 'BKASH' })).toBe(0);
    expect(codToCollect({ ...cod, paidMinor: 12_000 })).toBe(111_000);
    expect(codToCollect({ ...cod, walletAppliedMinor: 23_000, paidMinor: 12_000 })).toBe(88_000);
    expect(dueOf({ ...cod, paidMinor: 200_000 })).toBe(0);
  });

  it('the pill: COD to collect, collected, settled; paid; partly paid; owed back', () => {
    const f = (x: Partial<MoneyFacts>): MoneyFacts => ({ status: 'CONFIRMED', refundedMinor: 0, ...cod, ...x });
    expect(paymentPill(f({}))).toBe('COD_TO_COLLECT');
    expect(paymentPill(f({ status: 'DELIVERED' }))).toBe('COD_COLLECTED');
    expect(paymentPill(f({ cod: 'collected' }))).toBe('COD_COLLECTED');
    expect(paymentPill(f({ status: 'DELIVERED', cod: 'settled' }))).toBe('COD_SETTLED');
    expect(paymentPill(f({ paymentMethod: 'BKASH', paidMinor: 123_000 }))).toBe('PAID');
    expect(paymentPill(f({ paymentMethod: 'BKASH', paidMinor: 23_000 }))).toBe('PARTLY_PAID');
    expect(paymentPill(f({ paymentMethod: 'BKASH' }))).toBe('UNPAID');
    expect(paymentPill(f({ status: 'CANCELLED', paymentMethod: 'BKASH', paidMinor: 123_000 }))).toBe('OWED_BACK');
  });
});

describe('PR 165 · mismatch reasons (SIM-F-028)', () => {
  const ok = { late: false, orderStatus: 'PLACED', dueBeforeMinor: 100, askedMinor: 100, receivedMinor: 100, askedCurrency: 'BDT', receivedCurrency: 'BDT' };
  it('money that fits has no reason; money that does not always has one, the first that applies', () => {
    expect(paymentMismatch(ok)).toBeNull();
    expect(paymentMismatch({ ...ok, receivedMinor: null, receivedCurrency: null })).toBeNull();
    expect(paymentMismatch({ ...ok, receivedMinor: 90 })).toBe('AMOUNT_DIFFERS');
    expect(paymentMismatch({ ...ok, receivedCurrency: 'usd' })).toBe('CURRENCY_DIFFERS');
    expect(paymentMismatch({ ...ok, dueBeforeMinor: 0 })).toBe('DUPLICATE_PAYMENT');
    expect(paymentMismatch({ ...ok, orderStatus: 'CANCELLED', dueBeforeMinor: 0 })).toBe('ORDER_CLOSED');
    expect(paymentMismatch({ ...ok, late: true, orderStatus: 'CANCELLED' })).toBe('PAID_AFTER_CLOSE');
  });

  it('the settings hold the words of exactly these codes, each once', () => {
    expect([...MISMATCH_REASONS].sort()).toEqual([...PAYMENT_MISMATCH_CODES].sort());
    expect(new Set(MISMATCH_REASONS).size).toBe(MISMATCH_REASONS.length);
  });
});
