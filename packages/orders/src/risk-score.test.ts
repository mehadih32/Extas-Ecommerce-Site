// PR 156 — the risk score model without a database (on PR 157's history counts and PR 158's address checks): every signal fires on its facts and stays quiet without them,
// a switched-off signal never counts, the owner's weights and thresholds decide the score and the band, the sum is capped
// at 100, and SIM-F-044 — a refusal the shop caused never counts against the customer. Every value is made up.
import { describe, expect, it } from 'vitest';
import { riskSettings, type RiskSignals } from '@extas/settings';
import { bandOf, scoreRisk, type AddressFacts, type KnownPlace, type PastOrder, type RiskConfig, type RiskFacts } from './pure';

const T = new Date('2026-10-24T06:00:00Z');
const H = 3_600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(T.getTime() - ms);
const name = (en: string) => ({ en, bn: null });
const HISTORY = riskSettings['risk.history'].default;

/** Every signal switched on with weight 10 (so a test reads which ones counted), the owner's other numbers as shipped. */
function allOn(): RiskSignals {
  const s = structuredClone(riskSettings['risk.signals'].default);
  for (const k of Object.keys(s) as (keyof RiskSignals)[]) Object.assign(s[k], { enabled: true, weight: 10 });
  s.orderValue.atLeastMinor = 500_000;
  s.riskyArea.areaIds = ['00000000-0000-4000-8000-0000000000d9'];
  s.areaRefusals.atLeast = 2;
  return s;
}
const config = (signals: RiskSignals = allOn()): RiskConfig => ({ signals, bands: riskSettings['risk.bands'].default, ourFault: HISTORY.ourFaultRefusals, noAnswerOutcomes: HISTORY.noAnswerOutcomes });

let seq = 0;
function past(status: PastOrder['status'], more: Partial<PastOrder> = {}): PastOrder {
  seq++;
  return { id: `o${seq}`, number: `EX-${1000 + seq}`, placedAt: ago(30 * D), status, totalMinor: 150_000, refusalKey: null, cancelCode: null, areaId: null, callOutcomes: [], returns: [], ...more };
}

const DHAKA = { id: '00000000-0000-4000-8000-0000000000d1', name: name('Dhaka') };
const BOGURA = { id: '00000000-0000-4000-8000-0000000000d2', name: name('Bogura') };
const DHANMONDI = { id: '00000000-0000-4000-8000-0000000000a1', name: name('Dhanmondi') };

const goodAddress: AddressFacts = { delivery: true, resolved: true, placeSure: true, detail: true, area: DHANMONDI, lineage: [DHAKA.id], district: DHAKA };
const knownDhaka: KnownPlace = { from: 'saved', area: DHANMONDI, lineage: [DHAKA.id], district: DHAKA };

function facts(more: Partial<RiskFacts> = {}): RiskFacts {
  return { placedAt: T, totalMinor: 150_000, past: [past('DELIVERED')], address: goodAddress, known: knownDhaka, placeRefusals: [], ...more };
}
const keys = (f: RiskFacts, c = config()) => scoreRisk(f, c).fired.map((x) => x.key);

describe('PR 156 · the risk score model', () => {
  it('a known customer with one delivered parcel and a settled address: nothing counts, score 0, the first band', () => {
    const r = scoreRisk(facts(), config());
    expect(r.fired).toEqual([]);
    expect(r.score).toBe(0);
    expect(r.band.key).toBe('low');
    expect(r.checked).toHaveLength(14);
    expect(r.off).toEqual([]);
  });

  it('PR 157: refusals, cancels, the share taken at the door, a first order, unanswered calls', () => {
    const refused = [past('RETURNED', { refusalKey: 'changed-mind' }), past('RETURNED', { refusalKey: 'no-money' }), past('DELIVERED')];
    expect(keys(facts({ past: refused }))).toEqual(expect.arrayContaining(['refusals', 'successRatio']));
    const r = scoreRisk(facts({ past: refused }), config());
    expect(r.fired.find((x) => x.key === 'successRatio')?.values).toMatchObject({ pct: 33, parcels: 3, delivered: 1 });
    expect(keys(facts({ past: [past('CANCELLED', { cancelCode: 'CUSTOMER_BEFORE_CONFIRM' }), past('CANCELLED', { cancelCode: 'ADVANCE_NOT_PAID' })] }))).toContain('cancels');
    expect(keys(facts({ past: [] }))).toContain('newPhone');
    expect(keys(facts({ past: [past('DELIVERED', { callOutcomes: ['NO_ANSWER'] })] }))).toContain('noAnswer');
    expect(keys(facts({ past: [past('DELIVERED', { callOutcomes: ['ANSWERED'] })] }))).not.toContain('noAnswer');
  });

  it('SIM-F-044: a refusal the shop caused is shown in the history and never counts; neither does "did not order"', () => {
    const ours = [past('RETURNED', { refusalKey: 'late' }), past('RETURNED', { refusalKey: 'wrong-item' }), past('RETURNED', { refusalKey: 'after-eid' }), past('DELIVERED')];
    const r = scoreRisk(facts({ past: ours }), config());
    expect(r.fired.map((x) => x.key)).not.toContain('refusals');
    expect(r.fired.map((x) => x.key)).not.toContain('successRatio');
    expect(r.history).toMatchObject({ orders: 4, refused: 0, ourFault: 3, delivered: 1 });
    // the owner takes a reason off his "our fault" list: it counts again
    const c = { ...config(), ourFault: ['wrong-item'] };
    expect(scoreRisk(facts({ past: ours }), c).fired.find((x) => x.key === 'refusals')?.values).toMatchObject({ count: 2, ourFault: 1 });
  });

  it('a cancel for a change after booking or by someone who never ordered never counts, whatever the owner ticks', () => {
    const s = allOn();
    s.cancels.codes = ['CUSTOMER_CHANGE_AFTER_BOOKING', 'NOT_ORDERED', 'OUT_OF_STOCK'];
    s.cancels.atLeast = 1;
    const p = [past('CANCELLED', { cancelCode: 'CUSTOMER_CHANGE_AFTER_BOOKING' }), past('CANCELLED', { cancelCode: 'NOT_ORDERED' })];
    expect(keys(facts({ past: p }), config(s))).not.toContain('cancels');
    expect(keys(facts({ past: [past('CANCELLED', { cancelCode: 'OUT_OF_STOCK' })] }), config(s))).toContain('cancels');
    // a code the owner did not tick does not count
    expect(keys(facts({ past: [past('CANCELLED', { cancelCode: 'DUPLICATE_ORDER' })] }), config(s))).not.toContain('cancels');
  });

  it('windows: a refusal older than the window is not counted; 0 days means ever', () => {
    const s = allOn();
    s.refusals.windowDays = 60;
    const old = [past('RETURNED', { refusalKey: 'changed-mind', placedAt: ago(90 * D) })];
    expect(keys(facts({ past: old }), config(s))).not.toContain('refusals');
    s.refusals.windowDays = 0;
    expect(keys(facts({ past: old }), config(s))).toContain('refusals');
  });

  it('another order in the last hours, and a parcel to this number with the courier now', () => {
    expect(scoreRisk(facts({ past: [past('PLACED', { placedAt: ago(2 * H), number: 'EX-2001' })] }), config()).fired.find((x) => x.key === 'recentOrder')?.values).toMatchObject({ number: 'EX-2001', withinHours: 24 });
    expect(keys(facts({ past: [past('DELIVERED', { placedAt: ago(30 * H) })] }))).not.toContain('recentOrder');
    expect(keys(facts({ past: [past('IN_TRANSIT')] }))).toContain('inTransit');
    expect(keys(facts({ past: [past('PACKED')] }))).not.toContain('inTransit');
  });

  it("the order's value: only from the owner's amount, and on a first order only when he says so", () => {
    expect(keys(facts({ totalMinor: 600_000 }))).not.toContain('orderValue'); // not a first order
    expect(keys(facts({ totalMinor: 600_000, past: [] }))).toContain('orderValue');
    const s = allOn();
    s.orderValue.atLeastMinor = null;
    expect(keys(facts({ totalMinor: 9_999_999, past: [] }), config(s))).not.toContain('orderValue');
    s.orderValue = { enabled: true, weight: 10, atLeastMinor: 500_000, firstOrderOnly: false };
    expect(keys(facts({ totalMinor: 600_000 }), config(s))).toContain('orderValue');
  });

  it('PR 158: no place, place not sure, no house details — only for a delivery', () => {
    expect(keys(facts({ address: { ...goodAddress, resolved: false, area: null, lineage: [], district: null } }))).toContain('addressUnresolved');
    expect(keys(facts({ address: { ...goodAddress, placeSure: false } }))).toContain('addressUnsure');
    expect(keys(facts({ address: { ...goodAddress, detail: false } }))).toContain('addressNoDetail');
    const pickup = { delivery: false, resolved: false, placeSure: null, detail: false, area: null, lineage: [], district: null };
    expect(keys(facts({ address: pickup }))).toEqual([]);
  });

  it('PR 158: a different district than the number is known by; at "area" level a place inside the known one is the same place', () => {
    const bogura = { ...goodAddress, area: { id: 'b1', name: name('Gabtali') }, lineage: [BOGURA.id], district: BOGURA };
    const r = scoreRisk(facts({ address: bogura }), config());
    expect(r.fired.find((x) => x.key === 'areaMismatch')?.values).toMatchObject({ known: 'Dhaka', now: 'Bogura', from: 'saved', level: 'district' });
    expect(keys(facts({ address: bogura, known: null }))).not.toContain('areaMismatch');
    const s = allOn();
    s.areaMismatch.level = 'area';
    const inside = { ...goodAddress, area: { id: 'a9', name: name('Road 5') }, lineage: [DHANMONDI.id, DHAKA.id] };
    expect(keys(facts({ address: inside }), config(s))).not.toContain('areaMismatch');
    const other = { ...goodAddress, area: { id: 'a8', name: name('Mirpur') }, lineage: [DHAKA.id] };
    expect(keys(facts({ address: other }), config(s))).toContain('areaMismatch');
  });

  it("PR 158: one of the owner's places (or a place under it), and many refusals at the same place", () => {
    const s = allOn();
    s.riskyArea.areaIds = [DHAKA.id];
    expect(scoreRisk(facts(), config(s)).fired.find((x) => x.key === 'riskyArea')?.values).toMatchObject({ areaId: DHAKA.id, area: 'Dhanmondi' });
    expect(keys(facts())).not.toContain('riskyArea');
    const at = [{ at: ago(5 * D), refusalKey: 'changed-mind' }, { at: ago(9 * D), refusalKey: null }];
    expect(keys(facts({ placeRefusals: at }))).toContain('areaRefusals');
    expect(keys(facts({ placeRefusals: [at[0]!, { at: ago(9 * D), refusalKey: 'damaged' }] }))).not.toContain('areaRefusals');
  });

  it("the owner's weights add up, the score is capped at 100 with the raw sum kept, and the band follows his thresholds", () => {
    const s = allOn();
    for (const k of Object.keys(s) as (keyof RiskSignals)[]) s[k].weight = 40;
    const bad = facts({ past: [past('RETURNED', { refusalKey: 'no-money' }), past('IN_TRANSIT', { placedAt: ago(H) })], address: { ...goodAddress, detail: false } });
    const r = scoreRisk(bad, config(s));
    expect(r.raw).toBeGreaterThan(100);
    expect(r.score).toBe(100);
    expect(r.band.key).toBe('high');
    expect(bandOf(riskSettings['risk.bands'].default, 34).key).toBe('low');
    expect(bandOf(riskSettings['risk.bands'].default, 35).key).toBe('medium');
    expect(bandOf(riskSettings['risk.bands'].default, 65).key).toBe('high');
  });

  it('a switched-off signal never counts and is listed as off; a weight of 0 counts nothing', () => {
    const s = allOn();
    s.newPhone.enabled = false;
    s.addressNoDetail.weight = 0;
    const r = scoreRisk(facts({ past: [], address: { ...goodAddress, detail: false } }), config(s));
    expect(r.off).toEqual(['newPhone']);
    expect(r.fired.map((x) => x.key)).not.toContain('addressNoDetail');
    expect(r.checked).toContain('addressNoDetail');
  });

  it('the same facts and settings always give the same answer (the stored reasons are the reasons)', () => {
    const f = facts({ past: [past('RETURNED', { refusalKey: 'no-money' })] });
    expect(scoreRisk(f, config())).toEqual(scoreRisk(f, config()));
  });
});
