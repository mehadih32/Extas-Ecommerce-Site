// PR 138 — the order state machine without a database: every (command, state) pair is walked against the table below,
// written from BACKEND-ARCHITECTURE §6.5.1 / §6.5.7 independently of pure.ts, so a change to the machine has to change
// this table too. Then the guards, the customer's cancel (CN-020 (5)), the money sums and the duplicate severity rule.
import { describe, expect, it } from 'vitest';
import { ORDER_CANCEL_CODES } from '@extas/settings';
import {
  addOnClosedWhy,
  customerEditClosedWhy,
  allowedCommands,
  CANCEL_CODES,
  NOT_A_RISK_SIGNAL,
  OPEN_STATES,
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
  addLine: { PLACED: FLAG, CONFIRMED: FLAG },
  removeLine: { PLACED: FLAG, CONFIRMED: FLAG },
  edit: { PLACED: FLAG, AWAITING_ADVANCE: FLAG, CONFIRMED: FLAG, ON_HOLD: FLAG },
  twoSizeCheck: { PLACED: FLAG, AWAITING_ADVANCE: FLAG, CONFIRMED: FLAG, ON_HOLD: FLAG },
  twoSizeAnswer: { PLACED: FLAG, AWAITING_ADVANCE: FLAG, CONFIRMED: FLAG, ON_HOLD: FLAG },
  // PR 156: the risk score is stored while the order is open; the status stays
  riskAssess: Object.fromEntries(OPEN_STATES.map((s) => [s, FLAG])),
  // PR 541: the section is set while the order is open; the status stays
  riskSection: Object.fromEntries(OPEN_STATES.map((s) => [s, FLAG])),
  // PR 161: a risk level's steps are written while the order is open; the status stays
  riskLevel: Object.fromEntries(OPEN_STATES.map((s) => [s, FLAG])),
  // PR 541 (SIM-F-014): a courier is booked for a confirmed order before it is handed over; the status stays
  book: { CONFIRMED: FLAG, PROCESSING: FLAG, PACKED: FLAG },
  awaitAdvance: { PLACED: 'AWAITING_ADVANCE', CONFIRMED: 'AWAITING_ADVANCE', ON_HOLD: 'AWAITING_ADVANCE' },
  recordAdvance: { AWAITING_ADVANCE: 'PLACED' },
  advanceResend: { AWAITING_ADVANCE: FLAG },
  startPicking: { CONFIRMED: 'PROCESSING' },
  pack: { CONFIRMED: 'PACKED', PROCESSING: 'PACKED' },
  handover: { PACKED: 'HANDED_OVER' },
  // PR 184: the courier's pick-up moves a booked order on from wherever packing stood
  courierPickedUp: { CONFIRMED: 'IN_TRANSIT', PROCESSING: 'IN_TRANSIT', PACKED: 'IN_TRANSIT', HANDED_OVER: 'IN_TRANSIT' },
  deliveryCorrected: { DELIVERED: 'RETURNED' },
  delivered: { HANDED_OVER: 'DELIVERED', IN_TRANSIT: 'DELIVERED' },
  partiallyDelivered: { IN_TRANSIT: 'PARTIALLY_DELIVERED' },
  returned: { HANDED_OVER: 'RETURNED', IN_TRANSIT: 'RETURNED' },
  // S08 · PR 185: an exchange is opened on a finished parcel; the order keeps its state
  exchange: { DELIVERED: FLAG, PARTIALLY_DELIVERED: FLAG, RETURNED: FLAG },
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
  courierPickedUp: { booked: true },
  deliveryCorrected: { deliveryCheckOpen: true },
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

  it('nothing ever leaves a final state; only flags (and, once the parcel is with the customer or back, an exchange) run there', () => {
    for (const s of ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'] as const) {
      expect(allowedCommands(order(s))).toEqual(['setFlags', 'exchange']);
      for (const c of allowedCommands(order(s))) expect(plan(c, order(s))).toMatchObject({ ok: true, moves: false });
    }
    expect(allowedCommands(order('CANCELLED'))).toEqual(['setFlags']);
  });

  it('PR 525: a delivered order is corrected to returned only while a true-delivery check is open', () => {
    expect(plan('deliveryCorrected', order('DELIVERED'))).toMatchObject({ ok: false, code: 'NO_DELIVERY_CHECK' });
    expect(plan('deliveryCorrected', order('DELIVERED', { deliveryCheckOpen: true }))).toMatchObject({ ok: true, to: 'RETURNED' });
    expect(allowedCommands(order('DELIVERED', { deliveryCheckOpen: true }))).toEqual(['setFlags', 'deliveryCorrected']);
    expect(plan('deliveryCorrected', order('IN_TRANSIT', { deliveryCheckOpen: true }))).toMatchObject({ ok: false, code: 'ILLEGAL_TRANSITION' });
  });

  it('release goes back to where the order was held from', () => {
    expect(plan('release', order('ON_HOLD', { holdFromStatus: 'PLACED' }))).toMatchObject({ ok: true, to: 'PLACED' });
    expect(plan('release', order('ON_HOLD', { holdFromStatus: 'CONFIRMED' }))).toMatchObject({ ok: true, to: 'CONFIRMED' });
  });

  it('a refusal lists the commands open now', () => {
    const p = plan('handover', order('PLACED'));
    expect(p).toMatchObject({ ok: false, code: 'ILLEGAL_TRANSITION', allowed: ['confirm', 'hold', 'cancel', 'requestCancel', 'setFlags', 'addLine', 'removeLine', 'edit', 'twoSizeCheck', 'twoSizeAnswer', 'riskAssess', 'riskSection', 'riskLevel', 'awaitAdvance'] });
  });
});

describe('the guards', () => {
  it('SIM-F-014: a courier is never booked while a review is open, a cancel is asked or pending, or it is booked already', () => {
    expect(plan('book', order('CONFIRMED'))).toMatchObject({ ok: true, to: 'CONFIRMED', moves: false });
    expect(plan('book', order('PACKED', { inReview: true }))).toMatchObject({ ok: false, code: 'IN_REVIEW' });
    expect(plan('book', order('CONFIRMED', { cancelRequested: true }))).toMatchObject({ ok: false, code: 'CANCEL_REQUESTED' });
    expect(plan('book', order('PACKED', { booked: true }))).toMatchObject({ ok: false, code: 'BOOKED' });
    expect(plan('book', order('PACKED', { booked: true, cancelPending: true }))).toMatchObject({ ok: false, code: 'CANCEL_PENDING' });
    // not before it is confirmed, never while on hold or waiting for an advance, never once cancelled
    for (const s of ['PLACED', 'ON_HOLD', 'AWAITING_ADVANCE', 'CANCELLED'] as const) expect(plan('book', order(s))).toMatchObject({ ok: false, code: 'ILLEGAL_TRANSITION' });
  });

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

describe('PR 142 · the team\'s edit (SIM-F-004: never once booked)', () => {
  it('open before picking, refused once a courier is booked, while a cancel is asked or requested, and from picking on', () => {
    for (const s of ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD'] as const) {
      expect(plan('edit', order(s))).toMatchObject({ ok: true, from: s, to: s, moves: false });
      expect(plan('edit', order(s, { booked: true }))).toMatchObject({ ok: false, code: 'BOOKED' });
      expect(plan('edit', order(s, { cancelPending: true }))).toMatchObject({ ok: false, code: 'CANCEL_PENDING' });
      expect(plan('edit', order(s, { cancelRequested: true }))).toMatchObject({ ok: false, code: 'CANCEL_REQUESTED' });
    }
    for (const s of ['PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const) expect(plan('edit', order(s))).toMatchObject({ ok: false, code: 'ILLEGAL_TRANSITION' });
  });

  it('SIM-F-038: "did not order" is a cancel reason and never a risk signal', () => {
    expect(CANCEL_CODES).toContain('NOT_ORDERED');
    expect(NOT_A_RISK_SIGNAL.has('NOT_ORDERED')).toBe(true);
    expect(NOT_A_RISK_SIGNAL.has('ADDRESS_UNREACHABLE')).toBe(false);
  });
});

describe('PR 143 · the customer\'s own edit window', () => {
  const cfg = { enabled: true, until: 'confirmed' as const, windowMinutes: 0, maxEdits: 2 };
  const at = new Date('2026-10-24T10:00:00Z');
  const o = (s: OrderState, more: Partial<MachineOrder> & { edits?: number; placedAt?: Date } = {}) => ({ ...order(s, more), placedAt: more.placedAt ?? at, edits: more.edits ?? 0 });
  it('off, the step, the time, the cap — and the machine first: never once booked or while a cancel is asked (SIM-F-004)', () => {
    expect(customerEditClosedWhy({ ...cfg, enabled: false }, o('PLACED'), at)).toBe('OFF');
    expect(customerEditClosedWhy(cfg, o('CONFIRMED'), at)).toBeNull();
    expect(customerEditClosedWhy({ ...cfg, until: 'placed' }, o('CONFIRMED'), at)).toBe('STEP');
    expect(customerEditClosedWhy({ ...cfg, until: 'placed' }, o('ON_HOLD', { holdFromStatus: 'PLACED' }), at)).toBeNull();
    expect(customerEditClosedWhy(cfg, o('PROCESSING'), at)).toBe('STEP');
    expect(customerEditClosedWhy(cfg, o('CONFIRMED', { booked: true }), at)).toBe('BOOKED');
    expect(customerEditClosedWhy(cfg, o('PLACED', { cancelRequested: true }), at)).toBe('CANCEL');
    expect(customerEditClosedWhy({ ...cfg, windowMinutes: 30 }, o('PLACED'), new Date(at.getTime() + 31 * 60_000))).toBe('TIME');
    expect(customerEditClosedWhy(cfg, o('PLACED', { edits: 2 }), at)).toBe('CAP');
  });
});

describe('PR 146 · the two-size answer (SIM-F-004: never once booked)', () => {
  it('the answer takes sizes out, so it follows the edit: refused once booked or while a cancel is asked; the check itself is only a note', () => {
    expect(plan('twoSizeAnswer', order('CONFIRMED'))).toMatchObject({ ok: true, moves: false });
    expect(plan('twoSizeAnswer', order('CONFIRMED', { booked: true }))).toMatchObject({ ok: false, code: 'BOOKED' });
    expect(plan('twoSizeAnswer', order('PLACED', { cancelRequested: true }))).toMatchObject({ ok: false, code: 'CANCEL_REQUESTED' });
    expect(plan('twoSizeAnswer', order('PROCESSING'))).toMatchObject({ ok: false, code: 'ILLEGAL_TRANSITION' });
    expect(plan('twoSizeCheck', order('PLACED', { inReview: true }))).toMatchObject({ ok: true, moves: false });
  });
});

describe('PR 127 · "Add to this parcel" (SIM-F-004)', () => {
  it('a booked order takes no new line, nor one with a cancel asked or requested', () => {
    for (const s of ['PLACED', 'CONFIRMED'] as const) {
      expect(plan('addLine', order(s, { booked: true }))).toMatchObject({ ok: false, code: 'BOOKED' });
      expect(plan('removeLine', order(s, { booked: true }))).toMatchObject({ ok: false, code: 'BOOKED' });
      expect(plan('addLine', order(s, { cancelPending: true }))).toMatchObject({ ok: false, code: 'CANCEL_PENDING' });
      expect(plan('addLine', order(s, { cancelRequested: true }))).toMatchObject({ ok: false, code: 'CANCEL_REQUESTED' });
    }
    expect(plan('addLine', order('PROCESSING'))).toMatchObject({ ok: false, code: 'ILLEGAL_TRANSITION' });
  });

  it("the customer's window: the owner's switch, Cash on Delivery only, his step, his time", () => {
    const at = new Date('2026-10-23T06:00:00Z');
    const later = (min: number) => new Date(at.getTime() + min * 60_000);
    const on = { enabled: true, until: 'confirmed' as const, windowMinutes: 0 };
    const o = (s: OrderState, more: Partial<MachineOrder> = {}, paymentMethod: string | null = 'COD') => ({ ...order(s, more), paymentMethod, placedAt: at });
    expect(addOnClosedWhy({ ...on, enabled: false }, o('PLACED'), at)).toBe('OFF');
    expect(addOnClosedWhy(on, o('PLACED', {}, 'BKASH'), at)).toBe('NOT_COD');
    expect(addOnClosedWhy(on, o('PLACED'), later(600))).toBeNull();
    expect(addOnClosedWhy(on, o('CONFIRMED'), at)).toBeNull();
    expect(addOnClosedWhy({ ...on, until: 'placed' }, o('CONFIRMED'), at)).toBe('STEP');
    expect(addOnClosedWhy(on, o('PROCESSING'), at)).toBe('STEP');
    expect(addOnClosedWhy(on, o('CONFIRMED', { booked: true }), at)).toBe('BOOKED');
    expect(addOnClosedWhy(on, o('PLACED', { cancelRequested: true }), at)).toBe('CANCEL');
    expect(addOnClosedWhy({ ...on, windowMinutes: 30 }, o('PLACED'), later(30))).toBeNull();
    expect(addOnClosedWhy({ ...on, windowMinutes: 30 }, o('PLACED'), later(31))).toBe('TIME');
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
