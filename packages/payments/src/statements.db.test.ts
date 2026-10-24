// S07 · PR 174 — the reconciliation report against the gateways' statements on a real PostgreSQL (throwaway database;
// skipped without TEST_DATABASE_ADMIN_URL): a statement imported once per file and reference, matched line by line (a
// matched payment's money RECONCILED with its fee kept; every other line with its reason), a checked line resolved,
// the practice gateway's own statement (only on the practice gateway while test payments are on), and the report of a
// period. SIM-F-028 (required acceptance test): every open mismatch in the report — gateway lines, courier COD lines,
// payment rows, payments no statement shows — carries its reason code and the owner's words; none is unexplained.
// Nothing is changed by a mismatch. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMockGateway } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { getGatewayStatement, importGatewayStatement, practiceStatement, reconciliationReport, resolveGatewayLine, type GatewayResolver } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const DAY = 86_400_000;

describe.skipIf(!HAS_TEST_DB)('PR 174 · gateway statements and the reconciliation report', () => {
  let f: PaymentsFixture;
  const mock: GatewayResolver = async (_s, provider) => ({ api: createMockGateway(provider), mode: 'MOCK' });
  const live: GatewayResolver = async (_s, provider) => ({ api: createMockGateway(provider), mode: 'LIVE' });
  const period = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-24T00:00:00Z') };
  const at = new Date('2026-10-20T10:00:00Z');
  const ids: Record<string, string> = {};

  /** A bKash payment on an order, in the state given, with its gateway transaction ID. */
  const gatewayPayment = async (number: string, trx: string, status: 'PAID' | 'FAILED', minor: number) => {
    const o = await f.order({ number, status: 'CONFIRMED', paymentMethod: 'BKASH', lines: [minor], paidMinor: status === 'PAID' ? minor : 0 });
    const p = await f.payment(o.id, { amountMinor: minor });
    await f.t.prisma.payment.update({ where: { id: p.id }, data: { status, providerTrxId: trx, ...(status === 'PAID' ? { receivedMinor: minor, paidAt: at, moneyStatus: 'PROVISIONAL' } : { statusAt: at }) } });
    return { orderId: o.id, paymentId: p.id };
  };

  beforeAll(async () => {
    f = await setUpPayments('payments_174');
    ids.a1 = (await gatewayPayment('G-1', 'TRXA1', 'PAID', 100_000)).paymentId;
    ids.a2 = (await gatewayPayment('G-2', 'TRXA2', 'PAID', 50_000)).paymentId;
    ids.a3 = (await gatewayPayment('G-3', 'TRXA3', 'FAILED', 30_000)).paymentId;
    ids.a4 = (await gatewayPayment('G-4', 'TRXA4', 'PAID', 20_000)).paymentId;
    // a refund a person paid out by hand and recorded with the gateway's reference
    const o = await f.order({ number: 'G-5', status: 'CANCELLED', paymentMethod: 'BKASH', paidMinor: 5_000 });
    await f.t.prisma.refund.create({ data: { storeId: f.A, orderId: o.id, amountMinor: 5_000, method: 'original', reason: 'CANCEL', source: 'CANCEL', status: 'COMPLETED', idempotencyKey: 'g5-refund', payoutReference: 'BKREF9', completedAt: at } });
  });
  afterAll(async () => f?.t.drop());

  const CSV = ['trx_id,amount,fee,date,type', `TRXA1,1000.00,18.50,${at.toISOString()},payment`, `TRXA2,490.00,9.00,${at.toISOString()},payment`, `TRXA3,300.00,,${at.toISOString()},payment`, `TRXZZ,99.00,,${at.toISOString()},payment`, `TRXA1,1000.00,,${at.toISOString()},payment`, `BK REF 9,50.00,,${at.toISOString()},refund`, `BKREF404,20.00,,${at.toISOString()},refund`].join('\n');
  const input = { provider: 'bkash', reference: 'BK-2026-10', periodFrom: period.from, periodTo: period.to, csv: CSV };

  it('imports once per file and reference; every line matched or given its reason; a match RECONCILED with its fee', async () => {
    expect(await code(importGatewayStatement(f.deps(), f.viewer, input))).toBe('FORBIDDEN');
    expect(await code(importGatewayStatement(f.deps(), f.staff, { ...input, csv: 'amount\n1' }))).toBe('INVALID_INPUT');
    const s = await importGatewayStatement(f.deps(), f.staff, input);
    expect(s).toMatchObject({ provider: 'bkash', reference: 'BK-2026-10', totalMinor: 100_000 + 49_000 + 30_000 + 9_900 + 100_000, feesMinor: 2_750, matched: 2, mismatched: 5, replay: false });
    expect(s.lines.map((l) => [l.trxId, l.kind, l.matchStatus, l.reasonCode])).toEqual([
      ['TRXA1', 'PAYMENT', 'MATCHED', null],
      ['TRXA2', 'PAYMENT', 'MISMATCH', 'AMOUNT_DIFFERS'],
      ['TRXA3', 'PAYMENT', 'MISMATCH', 'NOT_PAID'],
      ['TRXZZ', 'PAYMENT', 'MISMATCH', 'UNKNOWN_PAYMENT'],
      ['TRXA1', 'PAYMENT', 'MISMATCH', 'DOUBLE_LINE'],
      ['BK REF 9', 'REFUND', 'MATCHED', null],
      ['BKREF404', 'REFUND', 'MISMATCH', 'UNKNOWN_REFUND'],
    ]);
    expect(s.lines.filter((l) => l.matchStatus === 'MISMATCH').every((l) => l.words && l.words.en && l.words.bn)).toBe(true);
    expect(s.reasons).toEqual({ AMOUNT_DIFFERS: 1, NOT_PAID: 1, UNKNOWN_PAYMENT: 1, DOUBLE_LINE: 1, UNKNOWN_REFUND: 1 });
    const p1 = await f.t.prisma.payment.findUniqueOrThrow({ where: { id: ids.a1! } });
    expect(p1).toMatchObject({ moneyStatus: 'RECONCILED', gatewayFeeMinor: 1_850 });
    // a mismatch changes nothing: the failed payment stays failed, the differing one stays provisional
    expect((await f.t.prisma.payment.findUniqueOrThrow({ where: { id: ids.a3! } })).status).toBe('FAILED');
    expect((await f.t.prisma.payment.findUniqueOrThrow({ where: { id: ids.a2! } })).moneyStatus).toBe('PROVISIONAL');
    expect(await importGatewayStatement(f.deps(), f.staff, input)).toMatchObject({ statementId: s.statementId, replay: true });
    expect(await code(importGatewayStatement(f.deps(), f.staff, { ...input, csv: `${CSV}\n` }))).toBe('DUPLICATE_REFERENCE');
    expect(await f.t.prisma.auditLog.count({ where: { action: 'gateway.statement.import', entityId: s.statementId } })).toBe(1);
    ids.statement = s.statementId;
    ids.unknown = s.lines.find((l) => l.reasonCode === 'UNKNOWN_PAYMENT')!.id;
    ids.matched = s.lines[0]!.id;
    ids.differs = s.lines[1]!.id;
  });

  it('a checked mismatch is resolved once with a note; a matching line has nothing to resolve', async () => {
    expect(await code(resolveGatewayLine(f.deps(), f.staff, ids.matched!, { note: 'fine' }))).toBe('NOT_PENDING');
    expect(await code(resolveGatewayLine(f.deps(), f.staff, ids.unknown!, { note: '' }))).toBe('INVALID_INPUT');
    expect(await resolveGatewayLine(f.deps(), f.staff, ids.unknown!, { note: 'a test payment from the bKash team' })).toMatchObject({ resolutionNote: 'a test payment from the bKash team', resolvedAt: expect.any(Date) });
    expect(await code(resolveGatewayLine(f.deps(), f.staff, ids.unknown!, { note: 'again' }))).toBe('ALREADY_RECORDED');
    // the differing payment counts as reconciled once a person has checked it
    await resolveGatewayLine(f.deps(), f.staff, ids.differs!, { note: 'bKash took a 10 taka charge from the customer' });
    expect((await f.t.prisma.payment.findUniqueOrThrow({ where: { id: ids.a2! } })).moneyStatus).toBe('RECONCILED');
    const s = await getGatewayStatement(f.deps(), f.viewer, ids.statement!);
    expect(s!.lines.filter((l) => l.resolvedAt).map((l) => l.trxId)).toEqual(['TRXA2', 'TRXZZ']);
    expect(await getGatewayStatement(f.deps(), f.viewer, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it("the practice gateway's own statement: only on the practice gateway while test payments are on; it imports as a real one", async () => {
    const ask = { provider: 'bkash', from: period.from, to: period.to };
    expect(await code(practiceStatement(f.deps(), f.staff, ask))).toBe('GATEWAY_ERROR');
    expect(await code(practiceStatement(f.deps({ gateways: live }), f.staff, ask))).toBe('TEST_PAYMENTS_OFF');
    f.overrides.set('payments.testPayments', false);
    try {
      expect(await code(practiceStatement(f.deps({ gateways: mock }), f.staff, ask))).toBe('TEST_PAYMENTS_OFF');
    } finally {
      f.overrides.delete('payments.testPayments');
    }
    expect(await code(practiceStatement(f.deps({ gateways: mock }), f.viewer, ask))).toBe('FORBIDDEN');
    const p = await practiceStatement(f.deps({ gateways: mock }), f.staff, ask);
    expect(p.lines).toBe(3);
    expect(p.csv.split('\n')[0]).toBe('trx_id,amount,fee,date');
    expect(p.csv).toContain('TRXA4,200.00,,');
    const s = await importGatewayStatement(f.deps(), f.staff, { provider: 'bkash', reference: 'PRACTICE-1', periodFrom: period.from, periodTo: period.to, csv: p.csv });
    // A1 and A2 are on the first statement already; A4 matches
    expect(s.lines.map((l) => [l.trxId, l.reasonCode])).toEqual([
      ['TRXA1', 'DOUBLE_LINE'],
      ['TRXA2', 'DOUBLE_LINE'],
      ['TRXA4', null],
    ]);
  });

  it('SIM-F-028 (acceptance) — the report: ours against the statements, and every open mismatch with its reason and words', async () => {
    // a courier COD line with its reason (PR 166), a payment row with its reason (PR 165), and a paid payment on no
    // statement after the owner's days (TRXA5)
    const courier = await f.courier('Report Courier');
    const settlement = await f.t.prisma.courierSettlement.create({ data: { storeId: f.A, courierAccountId: courier.id, reference: 'C-1', totalCodMinor: 7_000, chargesMinor: 0, netMinor: 7_000, status: 'IMPORTED' } });
    await f.t.prisma.courierSettlementLine.create({ data: { storeId: f.A, settlementId: settlement.id, lineNo: 1, consignmentId: 'CN-1', codMinor: 7_000, chargeMinor: 0, expectedMinor: 8_000, matchState: 'MISMATCH', reasonCode: 'SHORT_PAID' } });
    await f.t.prisma.payment.update({ where: { id: ids.a2! }, data: { mismatchReason: 'AMOUNT_DIFFERS' } });
    ids.a5 = (await gatewayPayment('G-6', 'TRXA5', 'PAID', 12_000)).paymentId;
    // a cancelled order still holding the customer's money with no refund asked (SIM-F-041)
    const held = await f.order({ number: 'G-7', status: 'CANCELLED', paymentMethod: 'BKASH', paidMinor: 9_000 });
    expect(await code(reconciliationReport(f.deps(), f.viewer, { from: period.to, to: period.from }))).toBe('INVALID_INPUT');
    f.overrides.set('payments.statement', { ...(await f.deps().settings.value('payments.statement')), missingAfterDays: 1 });
    f.clock.now = new Date('2026-10-23T06:00:00Z');
    try {
      const r = await reconciliationReport(f.deps(), f.viewer, period);
      expect(r.gateways).toEqual([
        {
          provider: 'bkash',
          ourCount: 4,
          ourReceivedMinor: 100_000 + 50_000 + 20_000 + 12_000,
          statementLines: 10,
          statementInMinor: 288_900 + 100_000 + 50_000 + 20_000,
          statementBackMinor: 7_000,
          // the practice statement carries the fee kept from the first one
          feesMinor: 2_750 + 1_850,
          differenceMinor: 288_900 + 170_000 - 182_000,
          openMismatches: 5,
        },
      ]);
      const codes = r.mismatches.map((m) => `${m.source}:${m.reasonCode}`).sort();
      expect(codes).toEqual(
        [
          'COD_LINE:SHORT_PAID',
          'GATEWAY_LINE:DOUBLE_LINE',
          'GATEWAY_LINE:DOUBLE_LINE',
          'GATEWAY_LINE:DOUBLE_LINE',
          'GATEWAY_LINE:NOT_PAID',
          'GATEWAY_LINE:UNKNOWN_REFUND',
          'MISSING:MISSING',
          'PAYMENT:AMOUNT_DIFFERS',
        ].sort(),
      );
      // the acceptance: no mismatch without its reason code and the owner's words in both languages
      expect(r.unexplained).toBe(0);
      for (const m of r.mismatches) {
        expect(m.reasonCode, m.id).toBeTruthy();
        expect(m.words?.en, m.id).toBeTruthy();
        expect(m.words?.bn, m.id).toBeTruthy();
      }
      expect(r.mismatches.find((m) => m.source === 'MISSING')).toMatchObject({ id: ids.a5, expectedMinor: 12_000, party: 'bkash' });
      expect(r.byReason).toMatchObject({ GATEWAY_LINE: { DOUBLE_LINE: 3, NOT_PAID: 1, UNKNOWN_REFUND: 1 }, COD_LINE: { SHORT_PAID: 1 }, PAYMENT: { AMOUNT_DIFFERS: 1 }, MISSING: { MISSING: 1 } });
      expect(r.owedNotAsked.map((x) => [x.number, x.inMinor, x.heldMinor])).toEqual([['G-7', 9_000, 0]]);
      expect(r.owedNotAsked.map((x) => x.orderId)).toEqual([held.id]);
      expect(r.refunds).toMatchObject({ count: 0, totalMinor: 0 });
      expect(r.wallets).toEqual({ checked: 0, drift: [] });
      expect(r.cod).toMatchObject({ partialsWaiting: 0 });
      // the owner's days are 0: nothing is listed as missing
      f.overrides.delete('payments.statement');
      expect((await reconciliationReport(f.deps(), f.viewer, period)).mismatches.some((m) => m.source === 'MISSING')).toBe(false);
      // a wallet whose kept balance drifted from its ledger is named
      const c = await f.customer('Drift Customer');
      await f.t.prisma.walletAccount.create({ data: { storeId: f.A, customerId: c.id, balanceMinor: 1_000, status: 'ACTIVE' } });
      expect((await reconciliationReport(f.deps(), f.viewer, period)).wallets).toEqual({ checked: 1, drift: [{ customerId: c.id, balanceMinor: 1_000, ledgerMinor: 0 }] });
    } finally {
      f.overrides.delete('payments.statement');
      f.clock.now = new Date(f.clock.now.getTime() - DAY);
    }
  });
});
