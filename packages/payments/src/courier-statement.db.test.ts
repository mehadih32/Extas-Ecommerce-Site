// S28 · PR 675 — the courier statement match screen on a real PostgreSQL (throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): "Accept the courier figure" books only the part of a charge above ours, once per line, only when
// the books took it (else nothing is resolved), and only for a line whose difference is that charge; the month statement lists
// the statements of a month, the lines still not matching, the figures accepted and the claims still to receive. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { acceptFigure, courierMonthStatement, extraChargeOf, importSettlement, recordDoorOutcome, type PaymentsDeps } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string; data?: unknown }).code ?? String(e);
  }
};
const DAY = 86_400_000;

describe('PR 675 · what a line may be accepted for', () => {
  const line = { matchState: 'MISMATCH', reasonCode: 'CHARGE_DIFFERS', chargeMinor: 7_000, expectedChargeMinor: 6_000 };
  it('is the courier charge above ours, only for a CHARGE_DIFFERS mismatch not yet resolved', () => {
    expect(extraChargeOf(line)).toBe(1_000);
    expect(extraChargeOf({ ...line, chargeMinor: 5_000 })).toBeNull();
    expect(extraChargeOf({ ...line, reasonCode: 'UNKNOWN_PARCEL' })).toBeNull();
    expect(extraChargeOf({ ...line, matchState: 'MATCHED' })).toBeNull();
    expect(extraChargeOf({ ...line, resolvedAt: new Date() })).toBeNull();
    expect(extraChargeOf({ ...line, expectedChargeMinor: null })).toBeNull();
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 675 · courier statement match', () => {
  let f: PaymentsFixture;
  let courierId = '';
  const booked: { lineId: string; amountMinor: number }[] = [];
  let costAnswer = 'WRITTEN';
  const deps = (hook = true): PaymentsDeps => ({
    ...f.deps(),
    ...(hook
      ? {
          books: {
            courierDifference: async (_w, c) => {
              if (costAnswer === 'WRITTEN') booked.push({ lineId: c.lineId, amountMinor: c.amountMinor });
              return { status: costAnswer, id: 'cost-1' };
            },
          },
        }
      : {}),
  });

  beforeAll(async () => {
    f = await setUpPayments('payments_675');
    courierId = (await f.courier('Statement courier')).id;
  });
  afterAll(async () => f?.t.drop());

  const delivered = async (no: string, cn: string) => {
    const o = await f.order({ number: no, lines: [100_000] }); // hardcode-ok: test fixture, a made-up price
    await f.shipment(o.id, { courierAccountId: courierId, consignmentId: cn, status: 'DELIVERED', chargeMinor: 6_000, deliveredAt: new Date(f.clock.now.getTime() - 2 * DAY) });
    await recordDoorOutcome(f.deps(), f.staff, o.id, { outcome: 'DELIVERED', collectedMinor: 100_000 }, { idempotencyKey: `stm-key-${cn}-0001` });
    return o;
  };

  it('accepting the courier figure books the extra once, only when the books took it, and resolves the line', async () => {
    const o = await delivered('S-1001', 'SC-1');
    const s = await importSettlement(f.deps(), f.staff, {
      courierAccountId: courierId,
      reference: 'STM-675',
      lines: [
        { consignmentId: 'SC-1', codMinor: 100_000, chargeMinor: 7_000, status: 'delivered' },
        { consignmentId: 'SC-404', codMinor: 20_000, chargeMinor: 6_000, status: 'delivered' },
      ],
    });
    const charge = s.lines.find((l) => l.consignmentId === 'SC-1')!;
    const unknown = s.lines.find((l) => l.consignmentId === 'SC-404')!;
    expect(charge).toMatchObject({ matchState: 'MISMATCH', reasonCode: 'CHARGE_DIFFERS' });

    const month = await courierMonthStatement(f.deps(), f.viewer, courierId);
    expect(month.open.find((x) => x.lineId === charge.id)?.extraChargeMinor).toBe(1_000);
    expect(month.open.find((x) => x.lineId === unknown.id)?.extraChargeMinor).toBeNull();
    expect(o.id).toBeTruthy();

    expect(await code(acceptFigure(deps(), f.viewer, charge.id))).toBe('FORBIDDEN');
    expect(await code(acceptFigure(deps(), f.staff, unknown.id))).toBe('NOT_ACCEPTABLE');
    expect(await code(acceptFigure(deps(), f.staff, 'not-an-id'))).toBe('NOT_FOUND');
    // no hook wired, or the books refused: nothing is resolved
    expect(await code(acceptFigure(deps(false), f.staff, charge.id))).toBe('COST_NOT_BOOKED');
    costAnswer = 'OFF';
    expect(await code(acceptFigure(deps(), f.staff, charge.id))).toBe('COST_NOT_BOOKED');
    expect((await f.t.prisma.courierSettlementLine.findUniqueOrThrow({ where: { id: charge.id } })).resolvedAt).toBeNull();
    expect(booked).toHaveLength(0);

    costAnswer = 'WRITTEN';
    expect(await acceptFigure(deps(), f.staff, charge.id, { note: 'courier panel agrees' })).toEqual({ lineId: charge.id, extraMinor: 1_000, costStatus: 'WRITTEN' });
    expect(booked).toEqual([{ lineId: charge.id, amountMinor: 1_000 }]);
    const after = await f.t.prisma.courierSettlementLine.findUniqueOrThrow({ where: { id: charge.id } });
    expect(after.resolvedAt).not.toBeNull();
    expect(after.moneyStatus).toBe('RECONCILED');
    expect(after.resolutionNote).toContain('Accepted the courier figure');
    expect(await f.t.prisma.auditLog.count({ where: { action: 'courier.figure.accept', entityId: charge.id } })).toBe(1);
    // once: a second press is refused and books nothing more
    expect(await code(acceptFigure(deps(), f.staff, charge.id))).toBe('ALREADY_RECORDED');
    expect(booked).toHaveLength(1);
  });

  it('the month statement: statements of the month, lines still open, figures accepted, claims still to receive', async () => {
    const o = await f.order({ number: 'S-2001', lines: [100_000] }); // hardcode-ok: test fixture, a made-up price
    await f.t.prisma.courierClaim.create({
      data: { storeId: f.A, courierAccountId: courierId, orderId: o.id, kind: 'SHORT_COD', claimedMinor: 4_000, idempotencyKey: 'stm-claim-1', deadlineAt: new Date(f.clock.now.getTime() - DAY) },
    });
    const m = await courierMonthStatement(f.deps(), f.viewer, courierId);
    expect(m.courier.name).toBe('Statement courier');
    expect(m.statements).toHaveLength(1);
    expect(m.statements[0]).toMatchObject({ reference: 'STM-675', lines: 2, mismatched: 2 });
    expect(m.totals.statements).toBe(1);
    expect(m.openCount).toBe(1);
    expect(m.accepted).toHaveLength(1);
    expect(m.accepted[0]).toMatchObject({ reference: 'STM-675', consignmentId: 'SC-1', extraMinor: 1_000 });
    expect(m.acceptedMinor).toBe(1_000);
    expect(m.claims).toEqual({ count: 1, minor: 4_000, late: 1 });
    expect(m.nextYm).toBeNull();
    expect(m.prevYm < m.ym).toBe(true);
    // another month is empty; a courier of another store is not there
    const old = await courierMonthStatement(f.deps(), f.viewer, courierId, { month: '2001-01' });
    expect(old).toMatchObject({ ym: '2001-01', statements: [], accepted: [], nextYm: '2001-02' });
    expect(await code(courierMonthStatement(f.deps(), { ...f.viewer, storeId: f.B }, courierId))).toBe('FORBIDDEN');
  });
});
