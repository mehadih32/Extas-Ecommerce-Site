// PR 138 — the order state machine without a database: every (command, state) pair is walked against the table below,
// written from BACKEND-ARCHITECTURE §6.5.1 / §6.5.7 independently of pure.ts, so a change to the machine has to change
// this table too. Then the guards, the customer's cancel (CN-020 (5)), the money sums and the duplicate severity rule.
import { describe, expect, it } from 'vitest';
import { ORDER_CANCEL_CODES } from '@extas/settings';
import {
  allowedCommands,
  CANCEL_CODES,
  customerCancelMode,
  dueOf,
  legalPairs,
  ORDER_COMMANDS,
  ORDER_STATES,
  overlapOf,
  paymentPill,
  plan,
  type MachineOrder,
  type OrderCommand,
  type OrderState,
} from './pure';

const FLAG = 'stays';
const BEFORE_BOOKING: OrderState[] = ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED'];
const BOOKABLE: OrderState[] = ['CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT'];

/** The spec: from which states each command runs and where it leads ("stays" = a flag command, the status stays). */
const SPEC: Record<OrderCommand, Partial<Record<OrderState, OrderState | typeof FLAG>>> = {
  confirm: { PLACED: 'CONFIRMED' },
  hold: { PLACED: 'ON_HOLD', CONFIRMED: 'ON_HOLD' },
  release: { ON_HOLD: 'CONFIRMED' },
  cancel: Object.fromEntries(BEFORE_BOOKING.map((s) => [s, 'CANCELLED'])),
  cancelAfterBooking: Object.fromEntries(BOOKABLE.map((s) => [s, FLAG])),
  courierCancelConfirmed: { CONFIRMED: 'CANCELLED', ON_HOLD: 'CANCELLED', PROCESSING: 'CANCELLED', PACKED: 'CANCELLED', HANDED_OVER: 'CANCELLED' },
  courierCancelRefused: Object.fromEntries(BOOKABLE.map((s) => [s, FLAG])),
  requestCancel: Object.fromEntries(BEFORE_BOOKING.map((s) => [s, FLAG])),
  refuseCancelRequest: Object.fromEntries(BEFORE_BOOKING.map((s) => [s, FLAG])),
  setFlags: Object.fromEntries(ORDER_STATES.filter((s) => s !== 'DRAFT').map((s) => [s, FLAG])),
  awaitAdvance: { PLACED: 'AWAITING_ADVANCE', CONFIRMED: 'AWAITING_ADVANCE', ON_HOLD: 'AWAITING_ADVANCE' },
  recordAdvance: { AWAITING_ADVANCE: 'PLACED' },
  startPicking: { CONFIRMED: 'PROCESSING' },
  pack: { CONFIRMED: 'PACKED', PROCESSING: 'PACKED' },
  handover: { PACKED: 'HANDED_OVER' },
  courierPickedUp: { HANDED_OVER: 'IN_TRANSIT' },
  delivered: { HANDED_OVER: 'DELIVERED', IN_TRANSIT: 'DELIVERED' },
  partiallyDelivered: { IN_TRANSIT: 'PARTIALLY_DELIVERED' },
  returned: { HANDED_OVER: 'RETURNED', IN_TRANSIT: 'RETURNED' },
};

const order = (status: OrderState, more: Partial<MachineOrder> = {}): MachineOrder => ({
  status,
  booked: false,
  cancelPending: false,
  cancelRequested: false,
  inReview: false,
  holdFromStatus: status === 'ON_HOLD' ? 'CONFIRMED' : null,
  paidMinor: 0,
  advanceRequiredMinor: null,
  ...more,
});

/** The facts that let each command's guards pass, so the table test sees only the state rule. */
const PASSING: Partial<Record<OrderCommand, Partial<MachineOrder>>> = {
  cancelAfterBooking: { booked: true },
  courierCancelConfirmed: { booked: true, cancelPending: true },
  courierCancelRefused: { booked: true, cancelPending: true },
  refuseCancelRequest: { cancelRequested: true },
  handover: { booked: true },
};

describe('the transition table (§6.5.1)', () => {
  for (const c of ORDER_COMMANDS)
    for (const s of ORDER_STATES) {
      const want = SPEC[c][s];
      it(`${c} from ${s}: ${want === undefined ? 'refused' : want === FLAG ? 'allowed, status stays' : `→ ${want}`}`, () => {
        const p = plan(c, order(s, PASSING[c]));
        if (want === undefined) {
          expect(p).toMatchObject({ ok: false, code: 'ILLEGAL_TRANSITION', from: s });
        } else {
          expect(p).toEqual({ ok: true, from: s, to: want === FLAG ? s : want, moves: want !== FLAG });
        }
      });
    }

  it('legalPairs lists exactly the table', () => {
    const fromSpec = Object.entries(SPEC).flatMap(([c, m]) => Object.entries(m).map(([from, to]) => `${c}:${from}:${to === FLAG ? from : to}`));
    expect(legalPairs().map((p) => `${p.command}:${p.from}:${p.to}`).sort()).toEqual(fromSpec.sort());
  });

  it('nothing ever leaves a final state except a flag', () => {
    for (const s of ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'] as const) {
      expect(allowedCommands(order(s))).toEqual(['setFlags']);
    }
  });

  it('release goes back to where the order was held from', () => {
    expect(plan('release', order('ON_HOLD', { holdFromStatus: 'PLACED' }))).toMatchObject({ ok: true, to: 'PLACED' });
    expect(plan('release', order('ON_HOLD', { holdFromStatus: 'CONFIRMED' }))).toMatchObject({ ok: true, to: 'CONFIRMED' });
  });

  it('a refusal lists the commands open now', () => {
    const p = plan('handover', order('PLACED'));
    expect(p).toMatchObject({ ok: false, code: 'ILLEGAL_TRANSITION', allowed: ['confirm', 'hold', 'cancel', 'requestCancel', 'setFlags', 'awaitAdvance'] });
  });
});

describe('the guards', () => {
  it('confirm waits for an open review and for a customer cancel request', () => {
    expect(plan('confirm', order('PLACED', { inReview: true }))).toMatchObject({ ok: false, code: 'IN_REVIEW' });
    expect(plan('confirm', order('PLACED', { cancelRequested: true }))).toMatchObject({ ok: false, code: 'CANCEL_REQUESTED' });
  });

  it('a booked order is never cancelled in one step (D5): cancel after booking, then the courier answers', () => {
    expect(plan('cancel', order('PACKED', { booked: true }))).toMatchObject({ ok: false, code: 'BOOKED' });
    expect(plan('cancelAfterBooking', order('PACKED'))).toMatchObject({ ok: false, code: 'NOT_BOOKED' });
    expect(plan('cancelAfterBooking', order('PACKED', { booked: true, cancelPending: true }))).toMatchObject({ ok: false, code: 'CANCEL_PENDING' });
    expect(plan('courierCancelConfirmed', order('PACKED', { booked: true }))).toMatchObject({ ok: false, code: 'NO_CANCEL_PENDING' });
    expect(plan('courierCancelRefused', order('PACKED', { booked: true }))).toMatchObject({ ok: false, code: 'NO_CANCEL_PENDING' });
  });

  it('a parcel whose cancel is asked is not packed or handed over (§6.5.7)', () => {
    expect(plan('pack', order('PROCESSING', { cancelPending: true, booked: true }))).toMatchObject({ ok: false, code: 'CANCEL_PENDING' });
    expect(plan('handover', order('PACKED', { cancelPending: true, booked: true }))).toMatchObject({ ok: false, code: 'CANCEL_PENDING' });
    expect(plan('handover', order('PACKED'))).toMatchObject({ ok: false, code: 'NOT_BOOKED' });
  });

  it('a cancel request is asked once, answered once, and not after booking', () => {
    expect(plan('requestCancel', order('CONFIRMED', { cancelRequested: true }))).toMatchObject({ ok: false, code: 'CANCEL_REQUESTED' });
    expect(plan('requestCancel', order('CONFIRMED', { booked: true }))).toMatchObject({ ok: false, code: 'BOOKED' });
    expect(plan('refuseCancelRequest', order('CONFIRMED'))).toMatchObject({ ok: false, code: 'NO_CANCEL_REQUEST' });
  });

  it('the advance moves the order on only when paid in full (F-043)', () => {
    expect(plan('recordAdvance', order('AWAITING_ADVANCE', { advanceRequiredMinor: 50_000, paidMinor: 20_000 }))).toMatchObject({ ok: false, code: 'ADVANCE_SHORT' });
    expect(plan('recordAdvance', order('AWAITING_ADVANCE', { advanceRequiredMinor: 50_000, paidMinor: 50_000 }))).toMatchObject({ ok: true, to: 'PLACED' });
  });
});

describe("the customer's cancel (CN-020 (5))", () => {
  const cfg = { cutoff: 'confirmed' as const, requests: true };
  it('one tap until the team confirms, then a request until booking, then nothing', () => {
    expect(customerCancelMode(cfg, order('PLACED'))).toBe('tap');
    expect(customerCancelMode(cfg, order('AWAITING_ADVANCE'))).toBe('tap');
    expect(customerCancelMode(cfg, order('ON_HOLD', { holdFromStatus: 'PLACED' }))).toBe('tap');
    expect(customerCancelMode(cfg, order('ON_HOLD', { holdFromStatus: 'CONFIRMED' }))).toBe('request');
    expect(customerCancelMode(cfg, order('CONFIRMED'))).toBe('request');
    expect(customerCancelMode(cfg, order('PACKED'))).toBe('request');
    expect(customerCancelMode(cfg, order('PACKED', { booked: true }))).toBe('none');
    expect(customerCancelMode(cfg, order('HANDED_OVER', { booked: true }))).toBe('none');
    expect(customerCancelMode(cfg, order('CONFIRMED', { cancelRequested: true }))).toBe('requested');
    expect(customerCancelMode(cfg, order('CANCELLED'))).toBe('none');
  });
  it("the owner's cut-off: off, never one tap, or until packed; requests can be switched off", () => {
    expect(customerCancelMode({ cutoff: 'off', requests: true }, order('PLACED'))).toBe('none');
    expect(customerCancelMode({ cutoff: 'placed', requests: true }, order('PLACED'))).toBe('request');
    expect(customerCancelMode({ cutoff: 'packed', requests: true }, order('PROCESSING'))).toBe('tap');
    expect(customerCancelMode({ cutoff: 'packed', requests: true }, order('PACKED'))).toBe('request');
    expect(customerCancelMode({ cutoff: 'confirmed', requests: false }, order('CONFIRMED'))).toBe('none');
  });
});

describe('reasons, money and the duplicate rule', () => {
  it('the cancel codes are the settings list (one list, two places)', () => {
    expect([...CANCEL_CODES]).toEqual([...ORDER_CANCEL_CODES]);
  });

  it('amount due = total − wallet − paid, never below 0 (F-001)', () => {
    expect(dueOf({ totalMinor: 100_000, walletAppliedMinor: 10_000, paidMinor: 30_000 })).toBe(60_000);
    expect(dueOf({ totalMinor: 100_000, walletAppliedMinor: 10_000, paidMinor: 95_000 })).toBe(0);
  });

  it('the payment pill (§6.5.3)', () => {
    const m = { status: 'PLACED' as OrderState, paymentMethod: 'COD', totalMinor: 100_000, walletAppliedMinor: 0, paidMinor: 0, refundedMinor: 0 };
    expect(paymentPill(m)).toBe('COD_TO_COLLECT');
    expect(paymentPill({ ...m, status: 'DELIVERED' })).toBe('COD_COLLECTED');
    expect(paymentPill({ ...m, paymentMethod: 'BKASH' })).toBe('UNPAID');
    expect(paymentPill({ ...m, paymentMethod: 'BKASH', paidMinor: 40_000 })).toBe('PARTLY_PAID');
    expect(paymentPill({ ...m, paymentMethod: 'BKASH', paidMinor: 100_000 })).toBe('PAID');
    expect(paymentPill({ ...m, paymentMethod: 'BKASH', paidMinor: 100_000, status: 'CANCELLED' })).toBe('OWED_BACK');
    expect(paymentPill({ ...m, paymentMethod: 'BKASH', paidMinor: 100_000, status: 'CANCELLED', refundedMinor: 100_000 })).toBe('PAID');
  });

  it('how alike two orders are (B1.12)', () => {
    const line = (variantId: string, productId: string, colourId: string, cat = 'shirts') => ({ variantId, productId, colourId, categoryIds: [cat] });
    expect(overlapOf([line('v1', 'p1', 'sky')], [line('v1', 'p1', 'sky')])?.severity).toBe('high');
    expect(overlapOf([line('v1', 'p1', 'sky')], [line('v2', 'p1', 'sky')])?.severity).toBe('high');
    expect(overlapOf([line('v1', 'p1', 'sky')], [line('v3', 'p1', 'white')])).toEqual({ severity: 'medium', productIds: ['p1'] });
    expect(overlapOf([line('v1', 'p1', 'sky')], [line('v9', 'p2', 'white')])).toEqual({ severity: 'low', productIds: [] });
    expect(overlapOf([line('v1', 'p1', 'sky')], [line('v8', 'p3', 'sky', 'tees')])).toBeNull();
  });
});
