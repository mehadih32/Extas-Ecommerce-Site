// S29 · PR 758 — the risk lens without a database: hotspots need minOrders settled orders and a rate over the warning
// per cent; refusals at the door are the customer's, the shop's own fault is apart; cancel reasons; risk areas; claims and
// tickets by their order's area; a part the viewer may not see is null and named in `hidden`.
import { describe, expect, it } from 'vitest';
import { buildRisk, NO_REASON, RISK_PARTS, type RiskOptions, type RiskPart, type RiskRecords } from './geo-risk';
import { BOGURA, GABTALI, PLACES, SHERPUR } from './geo-lens-fixtures';

const DAYS = { from: '2026-10-01', to: '2026-10-31' };
const opts = (over: Partial<RiskOptions> = {}): RiskOptions => ({ timeZone: 'Asia/Dhaka', level: 'upazila', minOrders: 5, warnReturnPct: 20, topBandKey: 'high', parts: new Set<RiskPart>(RISK_PARTS), ...over });
const times = <T>(n: number, v: T): T[] => Array.from({ length: n }, () => v);
const empty = (): RiskRecords => ({ delivered: [], returned: [], refused: [], cancelled: [], scored: [], claims: [], tickets: [], ticketsWithoutOrder: 0 });
const rowFor = (r: ReturnType<typeof buildRisk>, id: string) => r.rows.find((x) => x.areaId === id)!;

describe('return hotspots', () => {
  const rec = { ...empty(), delivered: [...times(4, { areaId: GABTALI.id }), ...times(10, { areaId: SHERPUR.id })], returned: [...times(3, { areaId: GABTALI.id }), ...times(1, { areaId: SHERPUR.id })] };
  const r = buildRisk(PLACES, rec, opts(), DAYS);

  it('is a hotspot at minOrders settled and a rate over the warning', () => {
    expect(rowFor(r, GABTALI.id).figures).toMatchObject({ delivered: 4, returned: 3, settled: 7, returnRate: 3 / 7 });
    expect(rowFor(r, GABTALI.id).flags).toContain('returnHotspot');
    expect(rowFor(r, SHERPUR.id).flags).not.toContain('returnHotspot');
  });
  it('too few settled orders is never a hotspot, however high the rate', () => {
    const few = buildRisk(PLACES, { ...empty(), returned: times(2, { areaId: GABTALI.id }) }, opts(), DAYS);
    expect(rowFor(few, GABTALI.id).figures.returnRate).toBe(1);
    expect(rowFor(few, GABTALI.id).flags).toEqual([]);
  });
  it('a rate exactly at the warning is not over it', () => {
    const at = buildRisk(PLACES, { ...empty(), delivered: times(8, { areaId: GABTALI.id }), returned: times(2, { areaId: GABTALI.id }) }, opts({ warnReturnPct: 20 }), DAYS);
    expect(rowFor(at, GABTALI.id).flags).toEqual([]);
  });
  it('the parts add up to the total', () => {
    expect(r.total).toMatchObject({ delivered: 14, returned: 4 });
  });
  it('the district level adds its upazilas', () => {
    const d = buildRisk(PLACES, rec, opts({ level: 'district' }), DAYS);
    expect(rowFor(d, BOGURA.id).figures).toMatchObject({ delivered: 14, returned: 4 });
  });
});

describe('refusals, cancels, risk, claims and tickets', () => {
  const rec: RiskRecords = {
    ...empty(),
    refused: [{ areaId: GABTALI.id, ourFault: false }, { areaId: GABTALI.id, ourFault: false }, { areaId: GABTALI.id, ourFault: true }],
    returned: times(4, { areaId: GABTALI.id }),
    cancelled: [{ areaId: GABTALI.id, reason: 'changed-mind' }, { areaId: GABTALI.id, reason: 'changed-mind' }, { areaId: GABTALI.id, reason: null }, { areaId: SHERPUR.id, reason: 'fake' }],
    scored: [...times(6, { areaId: GABTALI.id, band: 'high' }), ...times(4, { areaId: GABTALI.id, band: 'low' }), ...times(5, { areaId: SHERPUR.id, band: 'low' })],
    claims: times(2, { areaId: SHERPUR.id }),
    tickets: times(3, { areaId: SHERPUR.id }),
    ticketsWithoutOrder: 4,
  };
  const r = buildRisk(PLACES, rec, opts(), DAYS);

  it('counts the customer-refused and the shop-fault refusals apart', () => {
    expect(rowFor(r, GABTALI.id).figures).toMatchObject({ refusedAtDoor: 2, refusedOurFault: 1, refusedShareOfReturns: 3 / 4 });
  });
  it('counts cancels and lists the reasons, a missing reason under its own name', () => {
    expect(rowFor(r, GABTALI.id).figures.cancelled).toBe(3);
    expect(r.extras.cancelReasons).toEqual([
      { key: 'changed-mind', count: 2 },
      { key: NO_REASON, count: 1 },
      { key: 'fake', count: 1 },
    ]);
    expect((r.extras.cancelReasonsByArea as Record<string, unknown>)[SHERPUR.id]).toEqual([{ key: 'fake', count: 1 }]);
  });
  it('flags a risk area by the share of top-band orders over the warning, with enough scored orders', () => {
    expect(rowFor(r, GABTALI.id).figures).toMatchObject({ scored: 10, highRisk: 6, highRiskShare: 0.6 });
    expect(rowFor(r, GABTALI.id).flags).toContain('riskArea');
    expect(rowFor(r, SHERPUR.id).flags).not.toContain('riskArea');
  });
  it("puts claims and tickets in their order's area, tickets with no order apart", () => {
    expect(rowFor(r, SHERPUR.id).figures).toMatchObject({ claims: 2, tickets: 3 });
    expect(r.extras.ticketsWithoutOrder).toBe(4);
  });
});

describe('a part the viewer may not see', () => {
  const rec: RiskRecords = { ...empty(), delivered: times(6, { areaId: GABTALI.id }), refused: [{ areaId: GABTALI.id, ourFault: false }], scored: times(6, { areaId: GABTALI.id, band: 'high' }), claims: [{ areaId: GABTALI.id }] };
  it('is null in every row and named in hidden, and never flags from it', () => {
    const r = buildRisk(PLACES, rec, opts({ parts: new Set<RiskPart>(['returns']) }), DAYS);
    expect(rowFor(r, GABTALI.id).figures).toMatchObject({ refusedAtDoor: null, highRisk: null, claims: null, tickets: null, cancelled: null });
    expect(rowFor(r, GABTALI.id).flags).toEqual([]);
    expect(r.hidden).toEqual(['refusals', 'cancels', 'risk', 'claims', 'tickets']);
    expect(r.extras.cancelReasons).toBeNull();
  });
  it('no top band means no risk figures even for a viewer who may see them', () => {
    const r = buildRisk(PLACES, rec, opts({ topBandKey: null }), DAYS);
    expect(rowFor(r, GABTALI.id).figures.highRisk).toBeNull();
    expect(r.hidden).toContain('risk');
  });
});

describe('a drill-down parent', () => {
  it('counts only the places under it', () => {
    const rec = { ...empty(), delivered: [{ areaId: GABTALI.id }, { areaId: 'upz-savar' }, { areaId: null }] };
    const r = buildRisk(PLACES, rec, opts({ parentAreaId: BOGURA.id }), DAYS);
    expect(r.rows.map((x) => x.areaId)).toEqual([GABTALI.id]);
    expect(r.total).toMatchObject({ delivered: 1 });
    expect(r.unknown).toMatchObject({ delivered: 0 });
  });
});
