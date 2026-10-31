// PR 166 — Cash on Delivery money without a database: the door amount matrix (SIM-F-001: COD, fully prepaid, part-paid),
// each door outcome with its money (SIM-F-005), the line matcher with every trap of the simulation plan §6.3 (SIM-F-028)
// and the courier's CSV read with the owner's column names.
import { registry } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { amountMinor, doorExpectation, doorSplit, doorVariance, matchLine, parseCsv, parseStatement, splitSets, type DoorFacts, type LineContext, type StatementLine } from './cod-match';

const facts = (x: Partial<DoorFacts> = {}): DoorFacts => ({
  paymentMethod: 'COD',
  totalMinor: 176_000, // two lines 85,000 + 85,000 and a 6,000 delivery charge
  walletAppliedMinor: 0,
  paidMinor: 0,
  deliveryChargeMinor: 6_000,
  lines: [
    { id: 'a', lineTotalMinor: 85_000 },
    { id: 'b', lineTotalMinor: 85_000 },
  ],
  ...x,
});

describe('PR 166 · the door amount (SIM-F-001)', () => {
  it('COD collects the due; fully prepaid collects nothing; part-paid collects the rest', () => {
    expect(doorExpectation('DELIVERED', facts())).toEqual({ expectedMinor: 176_000, expectedChargeMinor: 0 });
    expect(doorExpectation('DELIVERED', facts({ paymentMethod: 'BKASH', paidMinor: 176_000 }))).toEqual({ expectedMinor: 0, expectedChargeMinor: 0 });
    expect(doorExpectation('DELIVERED', facts({ paidMinor: 6_000 }))).toEqual({ expectedMinor: 170_000, expectedChargeMinor: 0 });
    expect(doorExpectation('DELIVERED', facts({ walletAppliedMinor: 10_000, paidMinor: 6_000 }))).toEqual({ expectedMinor: 160_000, expectedChargeMinor: 0 });
  });

  it('a paid customer is never asked again: any money at the door of a paid order is a mismatch', () => {
    const paid = facts({ paymentMethod: 'BKASH', paidMinor: 176_000 });
    for (const outcome of ['DELIVERED', 'PARTIAL', 'RETURNED_CHARGE_PAID'] as const) {
      const exp = doorExpectation(outcome, paid, ['a']);
      expect(exp).toEqual({ expectedMinor: 0, expectedChargeMinor: 0 });
      expect(doorVariance(outcome, exp, { collectedMinor: 176_000, chargeCollectedMinor: 0 }, 0, 0)).toBe('PAID_ORDER_COLLECTED');
      expect(doorVariance(outcome, exp, { collectedMinor: 0, chargeCollectedMinor: 6_000 }, 0, 0)).toBe('PAID_ORDER_COLLECTED');
    }
  });
});

describe('PR 166 · each door outcome with its money (SIM-F-005)', () => {
  it('partial: the kept pieces share of the goods plus the delivery charge, less what is paid', () => {
    expect(doorExpectation('PARTIAL', facts(), ['a'])).toEqual({ expectedMinor: 91_000, expectedChargeMinor: 0 });
    expect(doorExpectation('PARTIAL', facts({ paidMinor: 6_000 }), ['a'])).toEqual({ expectedMinor: 85_000, expectedChargeMinor: 0 });
    // a discount spreads over the lines: 160,000 of goods for 170,000 of line totals
    expect(doorExpectation('PARTIAL', facts({ totalMinor: 166_000 }), ['b'])).toEqual({ expectedMinor: 86_000, expectedChargeMinor: 0 });
    expect(doorVariance('PARTIAL', { expectedMinor: 91_000, expectedChargeMinor: 0 }, { collectedMinor: 91_000, chargeCollectedMinor: 0 }, 176_000, 0)).toBe('PARTIAL_DELIVERY');
    expect(doorVariance('PARTIAL', { expectedMinor: 91_000, expectedChargeMinor: 0 }, { collectedMinor: 85_000, chargeCollectedMinor: 0 }, 176_000, 0)).toBe('SHORT_COLLECTED');
  });

  it('returned with the charge paid: no goods money, the delivery charge collected', () => {
    const exp = doorExpectation('RETURNED_CHARGE_PAID', facts());
    expect(exp).toEqual({ expectedMinor: 0, expectedChargeMinor: 6_000 });
    expect(doorVariance('RETURNED_CHARGE_PAID', exp, { collectedMinor: 0, chargeCollectedMinor: 6_000 }, 176_000, 0)).toBe('CHARGE_PAID_RETURN');
    expect(doorVariance('RETURNED_CHARGE_PAID', exp, { collectedMinor: 0, chargeCollectedMinor: 0 }, 176_000, 0)).toBe('SHORT_COLLECTED');
  });

  it('a failed attempt and a return collect nothing; money taken anyway is named', () => {
    for (const outcome of ['ATTEMPT_FAILED', 'RETURNED'] as const) {
      const exp = doorExpectation(outcome, facts());
      expect(exp).toEqual({ expectedMinor: 0, expectedChargeMinor: 0 });
      expect(doorVariance(outcome, exp, { collectedMinor: 0, chargeCollectedMinor: 0 }, 176_000, 0)).toBeNull();
      expect(doorVariance(outcome, exp, { collectedMinor: 500, chargeCollectedMinor: 0 }, 176_000, 0)).toBe('OVER_COLLECTED');
    }
  });

  it('delivered in full with the exact amount has no reason; the tolerance is the owner’s', () => {
    const exp = doorExpectation('DELIVERED', facts());
    expect(doorVariance('DELIVERED', exp, { collectedMinor: 176_000, chargeCollectedMinor: 0 }, 176_000, 0)).toBeNull();
    expect(doorVariance('DELIVERED', exp, { collectedMinor: 175_990, chargeCollectedMinor: 0 }, 176_000, 0)).toBe('SHORT_COLLECTED');
    expect(doorVariance('DELIVERED', exp, { collectedMinor: 175_990, chargeCollectedMinor: 0 }, 176_000, 10)).toBeNull();
  });
});

describe('PR 166 · a statement line against our records (SIM-F-028)', () => {
  const at = new Date('2026-10-24T00:00:00Z');
  const ctx = (x: Partial<LineContext> = {}): LineContext => ({
    found: true,
    alreadySettled: false,
    door: null,
    shipmentCodMinor: 176_000,
    expectedChargeMinor: 6_000,
    deliveredAt: new Date('2026-10-20T00:00:00Z'),
    receivedAt: at,
    toleranceMinor: 0,
    lateAfterDays: 0,
    ...x,
  });
  const line = (x: Partial<StatementLine> = {}): StatementLine => ({ lineNo: 1, consignmentId: 'CN-1', codMinor: 176_000, chargeMinor: 6_000, status: 'DELIVERED', rawStatus: 'Delivered', ...x });

  it('a line that fits matches, with the days it took', () => {
    expect(matchLine(line(), ctx())).toEqual({ matchState: 'MATCHED', reasonCode: null, expectedMinor: 176_000, expectedChargeMinor: 6_000, settleDays: 4 });
  });

  it('trap 1: a return with the charge paid, marked delivered', () => {
    const door = { outcome: 'RETURNED_CHARGE_PAID' as const, state: 'RECORDED', expectedMinor: 0, collectedMinor: 0, chargeCollectedMinor: 6_000 };
    expect(matchLine(line({ codMinor: 176_000 }), ctx({ door }))).toMatchObject({ matchState: 'MISMATCH', reasonCode: 'RETURN_AS_DELIVERED', expectedMinor: 6_000 });
    // the same return reported as a return with the charge remitted matches
    expect(matchLine(line({ codMinor: 6_000, status: 'RETURNED' }), ctx({ door }))).toMatchObject({ matchState: 'MATCHED' });
  });

  it('trap 2: a partial delivery we have not approved; an approved one matches its own amount', () => {
    expect(matchLine(line({ codMinor: 91_000, status: 'PARTIAL' }), ctx())).toMatchObject({ matchState: 'MISMATCH', reasonCode: 'PARTIAL_DELIVERY' });
    const pending = { outcome: 'PARTIAL' as const, state: 'PENDING_APPROVAL', expectedMinor: 91_000, collectedMinor: 91_000, chargeCollectedMinor: 0 };
    expect(matchLine(line({ codMinor: 91_000, status: 'PARTIAL' }), ctx({ door: pending }))).toMatchObject({ reasonCode: 'PARTIAL_DELIVERY' });
    expect(matchLine(line({ codMinor: 91_000, status: 'PARTIAL' }), ctx({ door: { ...pending, state: 'APPROVED' } }))).toMatchObject({ matchState: 'MATCHED', expectedMinor: 91_000 });
  });

  it('trap 3: a parcel we cannot find, and the same parcel twice', () => {
    expect(matchLine(line(), ctx({ found: false }))).toEqual({ matchState: 'MISMATCH', reasonCode: 'UNKNOWN_PARCEL', expectedMinor: null, expectedChargeMinor: null, settleDays: 4 });
    expect(matchLine(line(), ctx({ alreadySettled: true }))).toMatchObject({ matchState: 'MISMATCH', reasonCode: 'DOUBLE_LINE' });
  });

  it('trap 4: the charge deducted twice; another charge', () => {
    expect(matchLine(line({ chargeMinor: 12_000 }), ctx())).toMatchObject({ reasonCode: 'DOUBLE_CHARGE' });
    expect(matchLine(line({ chargeMinor: 7_000 }), ctx())).toMatchObject({ reasonCode: 'CHARGE_DIFFERS' });
    // our charge not known yet: not checked
    expect(matchLine(line({ chargeMinor: 12_000 }), ctx({ expectedChargeMinor: null }))).toMatchObject({ matchState: 'MATCHED' });
  });

  it('trap 5: a late settlement (only while the owner set a limit)', () => {
    const late = ctx({ deliveredAt: new Date('2026-10-10T00:00:00Z') });
    expect(matchLine(line(), late)).toMatchObject({ matchState: 'MATCHED', settleDays: 14 });
    expect(matchLine(line(), { ...late, lateAfterDays: 7 })).toMatchObject({ matchState: 'LATE', reasonCode: 'LATE_SETTLEMENT', settleDays: 14 });
  });

  it('short, over and not collected', () => {
    expect(matchLine(line({ codMinor: 78_100 }), ctx())).toMatchObject({ reasonCode: 'SHORT_PAID' });
    expect(matchLine(line({ codMinor: 200_000 }), ctx())).toMatchObject({ reasonCode: 'OVER_PAID' });
    expect(matchLine(line({ codMinor: 0 }), ctx())).toMatchObject({ reasonCode: 'NOT_COLLECTED' });
    const returned = { outcome: 'RETURNED' as const, state: 'RECORDED', expectedMinor: 0, collectedMinor: 0, chargeCollectedMinor: 0 };
    expect(matchLine(line({ codMinor: 0, status: 'RETURNED' }), ctx({ door: returned }))).toMatchObject({ matchState: 'MATCHED' });
    expect(matchLine(line({ codMinor: 1_000, status: 'RETURNED' }), ctx({ door: returned }))).toMatchObject({ reasonCode: 'OVER_PAID' });
  });
});

describe('PR 166 · the courier CSV file', () => {
  const format = registry['payments.cod.statement'].default;
  it('reads quoted fields, taka amounts with commas, Bengali digits and the owner’s header names', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
    expect(amountMinor('৳1,250.50')).toBe(125_050);
    expect(amountMinor('Tk 1250')).toBe(125_000);
    expect(amountMinor('১২৫০')).toBe(125_000);
    expect(amountMinor('abc')).toBeNull();
    const p = parseStatement('Consignment ID,Collected Amount,Delivery Charge,Status\nCN-1,"1,760",60,Delivered\nCN-2,910,60,Partial Delivery\nCN-3,0,60,Paid_Return\nCN-4,10,60,Hold\n', format);
    expect(p).toEqual({
      ok: true,
      lines: [
        { lineNo: 1, consignmentId: 'CN-1', codMinor: 176_000, chargeMinor: 6_000, status: 'DELIVERED', rawStatus: 'Delivered' },
        { lineNo: 2, consignmentId: 'CN-2', codMinor: 91_000, chargeMinor: 6_000, status: 'PARTIAL', rawStatus: 'Partial Delivery' },
        { lineNo: 3, consignmentId: 'CN-3', codMinor: 0, chargeMinor: 6_000, status: 'RETURNED', rawStatus: 'Paid_Return' },
        { lineNo: 4, consignmentId: 'CN-4', codMinor: 1_000, chargeMinor: 6_000, status: 'OTHER', rawStatus: 'Hold' },
      ],
    });
  });

  it('names every row it cannot read; nothing is guessed', () => {
    expect(parseStatement('Parcel,Money\nCN-1,10\n', format)).toEqual({ ok: false, problems: ['no consignment column', 'no COD amount column'] });
    expect(parseStatement('cn,cod\n,10\nCN-2,ten\n', format)).toEqual({ ok: false, problems: ['line 1: no consignment', 'line 2: the COD amount is not a number'] });
    expect(parseStatement('cn,cod\n', format)).toEqual({ ok: false, problems: ['the file has no lines'] });
  });
});

describe('CN-018 (4) · a split set at the door (follow-up 330)', () => {
  const lines = [
    { id: 'a', lineTotalMinor: 80_000, unitPriceMinor: 100_000, quantity: 1, comboId: 'set', comboGroupKey: 'g1' },
    { id: 'b', lineTotalMinor: 80_000, unitPriceMinor: 100_000, quantity: 1, comboId: 'set', comboGroupKey: 'g1' },
    { id: 'c', lineTotalMinor: 50_000, unitPriceMinor: 50_000, quantity: 1, comboId: null, comboGroupKey: null },
  ];
  const f = facts({ totalMinor: 216_000, lines });
  const rule = (mode: 'FIXED' | 'FLEXIBLE', priceRule: 'PRO_RATA' | 'OWN_PRICE' = 'PRO_RATA', chargeUnderFreeLimit = false) => new Map([['set', { mode, priceRule, chargeUnderFreeLimit }]]);

  it('finds only the sets a partial splits', () => {
    expect(splitSets(lines, ['a', 'c'])).toEqual([{ groupKey: 'g1', comboId: 'set', keptIds: ['a'], returnedIds: ['b'] }]);
    expect(splitSets(lines, ['a', 'b'])).toEqual([]);
    expect(splitSets(lines, ['c'])).toEqual([]);
  });

  it('a fixed set split is named; a flexible one on its own price lists its kept pieces; no rule = pro rata', () => {
    expect(doorSplit(lines, ['a'], rule('FIXED')).fixed).toHaveLength(1);
    expect(doorSplit(lines, ['a'], rule('FLEXIBLE', 'OWN_PRICE', true))).toEqual({ fixed: [], ownPriceIds: ['a'], chargeUnderFreeLimit: true });
    expect(doorSplit(lines, ['a'], new Map())).toEqual({ fixed: [], ownPriceIds: [], chargeUnderFreeLimit: false });
  });

  it('prices the kept piece pro rata, at its own price, and with the charge the kept part owes — never above the due', () => {
    expect(doorExpectation('PARTIAL', f, ['a']).expectedMinor).toBe(86_000);
    expect(doorExpectation('PARTIAL', f, ['a'], { ownPriceIds: ['a'] }).expectedMinor).toBe(106_000);
    expect(doorExpectation('PARTIAL', facts({ totalMinor: 210_000, deliveryChargeMinor: 0, lines }), ['a'], { extraChargeMinor: 6_000 }).expectedMinor).toBe(86_000);
    expect(doorExpectation('PARTIAL', facts({ totalMinor: 216_000, paidMinor: 150_000, lines }), ['a'], { ownPriceIds: ['a'] }).expectedMinor).toBe(0);
  });
});
