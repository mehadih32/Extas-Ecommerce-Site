// PR 214 follow-up — Eid order-by dates, the pure engine (no database). Acceptance tests from the 50-order simulation
// (docs/qa/SIMULATION-REPORT.md §5): SIM-F-019 (past a place's date the customer reads "may arrive after Eid", never
// the normal promise; one test per band before and after its date), SIM-F-033 (no Eid date ships: empty by default)
// and probe 4 (the banner with its dates around "today"). The lessons: every amount in customer copy is the amount due,
// and every promise in customer copy is tested. Every date and amount below is a made-up test value.
import { describe, expect, it } from 'vitest';
import { registry, type Key, type Value } from '@extas/settings';
import {
  daysBetween,
  eidBanner,
  eidBannerLines,
  eidIssues,
  eidStatus,
  fillEidText,
  formatDay,
  formatValue,
  lateLine,
  localParts,
  orderByFor,
  preorderLine,
  preorderOffer,
  unknownTokens,
  EID_TEXT_TOKENS,
  type EidConfig,
  type TextContext,
} from '../src/pure';

const TZ = 'Asia/Dhaka'; // UTC+6, no summer time
const en: TextContext = { locale: 'en-BD', currency: 'BDT', timeZone: TZ };
const bn: TextContext = { locale: 'bn-BD', currency: 'BDT', timeZone: TZ };
/** An instant at a store-local day and time in Dhaka. */
const at = (day: string, time = '12:00') => new Date(`${day}T${time}:00+06:00`);

/** The registry's defaults, exactly as a new installation reads them. */
function defaults(): EidConfig {
  const d = <K extends Key>(k: K): Value<K> => registry[k].default as Value<K>;
  return {
    enabled: d('rules.eid.enabled'),
    eidDate: d('rules.eid.eidDate'),
    bandDates: d('rules.eid.bandDates'),
    districtDates: d('rules.eid.districtDates'),
    cutoffTime: d('rules.eid.cutoffTime'),
    showDaysBefore: d('rules.eid.showDaysBefore'),
    bannerText: d('rules.eid.bannerText'),
    lateText: d('rules.eid.lateText'),
    preorderEnabled: d('rules.eid.preorder.enabled'),
    preorderAdvanceMinor: d('rules.eid.preorder.advanceMinor'),
    preorderAdvanceType: d('rules.eid.preorder.advanceType'),
    preorderAdvancePercent: d('rules.eid.preorder.advancePercent'),
    preorderText: d('rules.eid.preorder.text'),
    preorderBannerText: d('rules.eid.preorder.bannerText'),
  };
}

const BANDS = [
  { band: 'dhaka-city', orderBy: '2027-03-06' },
  { band: 'dhaka-sub-area', orderBy: '2027-03-05' },
  { band: 'outside-dhaka', orderBy: '2027-03-03' },
];

/** Switched on with an Eid day and one date per band; pre-order still the owner's (empty). */
const live = (over: Partial<EidConfig> = {}): EidConfig => ({ ...defaults(), enabled: true, eidDate: '2027-03-10', bandDates: BANDS, ...over });

const money = (minor: number, ctx = en) => formatValue('money', minor, ctx)!;
const dayAfter = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

describe('Eid order-by dates: empty and off by default (SIM-F-033)', () => {
  it('ships no Eid day, no dates and no pre-order; it is off and promises nothing', () => {
    const c = defaults();
    expect(c.enabled).toBe(false);
    expect(c.eidDate).toBeNull();
    expect(c.bandDates).toBeNull();
    expect(c.districtDates).toBeNull();
    expect(c.preorderEnabled).toBeNull();
    expect(c.preorderAdvanceMinor).toBeNull();
    expect(eidStatus(c, { band: 'dhaka-city' }, at('2027-03-01'), TZ)).toEqual({ state: 'off' });
    expect(eidBanner(c, at('2027-03-01'), TZ)).toBeNull();
    expect(eidIssues(c)).toEqual(expect.arrayContaining(['EID_DATE_MISSING', 'NO_DATES']));
  });

  it('the owner-data settings are flagged so no owner value ships, and pre-order needs his OK', () => {
    for (const k of ['rules.eid.eidDate', 'rules.eid.bandDates', 'rules.eid.districtDates', 'rules.eid.preorder.enabled', 'rules.eid.preorder.advanceMinor', 'rules.eid.preorder.advancePercent'] as const) {
      expect(registry[k].isOwnerData).toBe(true);
      expect(registry[k].default).toBeNull();
    }
    expect(registry['rules.eid.preorder.enabled'].requiresOwnerOk).toBe(true);
    expect(registry['rules.eid.preorder.advanceMinor'].requiresOwnerOk).toBe(true);
    expect(registry['rules.eid.preorder.advancePercent'].requiresOwnerOk).toBe(true);
  });

  it('switched on but with no Eid day it still says nothing', () => {
    expect(eidStatus({ ...live(), eidDate: null }, { band: 'dhaka-city' }, at('2027-03-01'), TZ)).toEqual({ state: 'off' });
  });
});

describe('each band before and after its date (SIM-F-019)', () => {
  for (const { band, orderBy } of BANDS) {
    it(`${band}: open up to ${orderBy} at the cut-off, then "may arrive after Eid"`, () => {
      const c = live();
      const before = eidStatus(c, { band }, at(orderBy, '09:00'), TZ);
      expect(before).toEqual({ state: 'open', orderBy, source: 'band', daysLeft: 0 });
      expect(eidStatus(c, { band }, at(orderBy, '23:59'), TZ).state).toBe('open');
      const dayEarlier = new Date(Date.parse(`${orderBy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      expect(eidStatus(c, { band }, at(dayEarlier), TZ)).toMatchObject({ state: 'open', daysLeft: 1 });

      const after = eidStatus(c, { band }, at(dayAfter(orderBy), '00:00'), TZ);
      expect(after).toEqual({ state: 'closed', orderBy, source: 'band', preorder: null });
      // The words the customer reads instead of the normal delivery promise.
      const line = lateLine(c, en);
      expect(line).toContain('after Eid');
      expect(line).toContain(formatDay('2027-03-10', 'en-BD'));
      expect(lateLine(c, bn)).toContain('ঈদের');
    });
  }

  it('a band with no date: nothing promised', () => {
    expect(eidStatus(live(), { band: 'islands' }, at('2027-03-01'), TZ)).toEqual({ state: 'none' });
    expect(eidStatus(live(), {}, at('2027-03-01'), TZ)).toEqual({ state: 'none' });
  });

  it("a district's own date wins over its band's", () => {
    const c = live({ districtDates: [{ district: 'bd.sample.far', orderBy: '2027-03-01' }] });
    expect(orderByFor(c, { band: 'outside-dhaka', district: 'bd.sample.far' })).toEqual({ orderBy: '2027-03-01', source: 'district' });
    expect(orderByFor(c, { band: 'outside-dhaka', district: 'bd.sample.near' })).toEqual({ orderBy: '2027-03-03', source: 'band' });
    expect(eidStatus(c, { band: 'outside-dhaka', district: 'bd.sample.far' }, at('2027-03-02'), TZ)).toMatchObject({ state: 'closed', source: 'district' });
    expect(eidStatus(c, { band: 'outside-dhaka', district: 'bd.sample.near' }, at('2027-03-02'), TZ)).toMatchObject({ state: 'open', source: 'band', daysLeft: 1 });
  });

  it('the cut-off time is the last minute that still counts, in the store time zone', () => {
    const c = live({ cutoffTime: '18:00' });
    expect(eidStatus(c, { band: 'dhaka-city' }, at('2027-03-06', '18:00'), TZ).state).toBe('open');
    expect(eidStatus(c, { band: 'dhaka-city' }, at('2027-03-06', '18:01'), TZ).state).toBe('closed');
    // 23:30 UTC on the 5th is already 05:30 on the 6th in Dhaka.
    expect(localParts(new Date('2027-03-05T23:30:00Z'), TZ)).toEqual({ day: '2027-03-06', time: '05:30' });
  });

  it('on Eid day a place past its date still reads the late line; after Eid everything stops', () => {
    expect(eidStatus(live(), { band: 'dhaka-city' }, at('2027-03-10', '10:00'), TZ).state).toBe('closed');
    expect(eidStatus(live(), { band: 'dhaka-city' }, at('2027-03-11', '00:00'), TZ)).toEqual({ state: 'off' });
    expect(eidBanner(live(), at('2027-03-11'), TZ)).toBeNull();
  });

  it('switched off, nothing shows even with every date set', () => {
    expect(eidStatus(live({ enabled: false }), { band: 'dhaka-city' }, at('2027-03-01'), TZ)).toEqual({ state: 'off' });
    expect(eidBanner(live({ enabled: false }), at('2027-03-01'), TZ)).toBeNull();
  });
});

describe('the banner around "today" (probe 4) and the date it promises', () => {
  it('shows from showDaysBefore days before a band\'s date, one line per open band, with that date', () => {
    const c = live({ showDaysBefore: 3 });
    expect(eidBanner(c, at('2027-02-27'), TZ)).toBeNull(); // 4 days before the latest date: not yet
    const b = eidBanner(c, at('2027-03-03'), TZ)!;
    expect(b).toEqual({
      kind: 'dates',
      bands: [
        { band: 'dhaka-city', orderBy: '2027-03-06', daysLeft: 3 },
        { band: 'dhaka-sub-area', orderBy: '2027-03-05', daysLeft: 2 },
        { band: 'outside-dhaka', orderBy: '2027-03-03', daysLeft: 0 },
      ],
    });
    const lines = eidBannerLines(c, b, en, { 'dhaka-city': { en: 'Dhaka city', bn: 'ঢাকা শহর' } });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(`Order by ${formatDay('2027-03-06', 'en-BD')} for delivery before Eid — Dhaka city`);
    expect(lines[2]).toContain(formatDay('2027-03-03', 'en-BD'));
    expect(lines[2]).toContain('outside-dhaka'); // no name given: the key, never an empty gap
    const bnLines = eidBannerLines(c, b, bn, { 'dhaka-city': { en: 'Dhaka city', bn: 'ঢাকা শহর' } });
    expect(bnLines[0]).toContain('ঢাকা শহর');
    expect(bnLines[0]).toContain(formatDay('2027-03-06', 'bn-BD'));
  });

  it('a band whose date passed yesterday leaves the banner today', () => {
    const b = eidBanner(live(), at('2027-03-04'), TZ)!;
    expect(b.kind).toBe('dates');
    expect(b.kind === 'dates' && b.bands.map((x) => x.band)).toEqual(['dhaka-city', 'dhaka-sub-area']);
  });

  it('once every date passed: nothing, unless the owner switched pre-order on with its advance', () => {
    expect(eidBanner(live(), at('2027-03-08'), TZ)).toBeNull();
    expect(eidBanner(live({ preorderAdvanceMinor: 50000 }), at('2027-03-08'), TZ)).toBeNull(); // advance but not on
    expect(eidBanner(live({ preorderEnabled: true }), at('2027-03-08'), TZ)).toBeNull(); // on but no advance
    const c = live({ preorderEnabled: true, preorderAdvanceMinor: 50000 });
    const b = eidBanner(c, at('2027-03-08'), TZ)!;
    expect(b).toEqual({ kind: 'preorder', offer: { advanceMinor: 50000, percent: null, dueMinor: null } });
    expect(eidBannerLines(c, b, en)[0]).toContain(money(50000));
    // A percentage advance: the banner has no order total, so it says the percentage.
    const p = live({ preorderEnabled: true, preorderAdvanceType: 'percent', preorderAdvancePercent: 20 });
    const pb = eidBanner(p, at('2027-03-08'), TZ)!;
    expect(pb).toEqual({ kind: 'preorder', offer: { advanceMinor: null, percent: 20, dueMinor: null } });
    expect(eidBannerLines(p, pb, en)[0]).toContain(formatValue('percent', 20, en)!);
  });

  it('daysBetween counts whole calendar days', () => {
    expect(daysBetween('2027-02-27', '2027-03-03')).toBe(4);
    expect(daysBetween('2027-03-03', '2027-03-03')).toBe(0);
  });
});

describe('pre-order: only with the owner\'s switch and advance; the copy says the amount due', () => {
  it('is never offered by default', () => {
    expect(preorderOffer(defaults(), 200000)).toBeNull();
    expect(eidStatus(live(), { band: 'dhaka-city' }, at('2027-03-08'), TZ, 200000)).toMatchObject({ state: 'closed', preorder: null });
  });

  it('due on delivery = total − advance; an advance above the total is capped', () => {
    const c = live({ preorderEnabled: true, preorderAdvanceMinor: 50000 });
    expect(preorderOffer(c, 200000)).toEqual({ advanceMinor: 50000, percent: null, dueMinor: 150000 });
    expect(preorderOffer(c, 30000)).toEqual({ advanceMinor: 30000, percent: null, dueMinor: 0 });
    expect(preorderOffer(c)).toEqual({ advanceMinor: 50000, percent: null, dueMinor: null });
    const s = eidStatus(c, { band: 'dhaka-city' }, at('2027-03-08'), TZ, 200000);
    expect(s).toEqual({ state: 'closed', orderBy: '2027-03-06', source: 'band', preorder: { advanceMinor: 50000, percent: null, dueMinor: 150000 } });
  });

  it('a percentage advance (CN-018): its share of the total now, the rest on delivery', () => {
    const p = live({ preorderEnabled: true, preorderAdvanceType: 'percent', preorderAdvancePercent: 20 });
    expect(preorderOffer(p, 200000)).toEqual({ advanceMinor: 40000, percent: 20, dueMinor: 160000 });
    expect(preorderOffer(p, 99999)).toEqual({ advanceMinor: 20000, percent: 20, dueMinor: 79999 });
    expect(preorderOffer(live({ preorderEnabled: true, preorderAdvanceType: 'percent', preorderAdvancePercent: 100 }), 200000)).toEqual({ advanceMinor: 200000, percent: 100, dueMinor: 0 });
    // The fixed amount is not used for a percentage advance, and the other way round.
    expect(preorderOffer(live({ preorderEnabled: true, preorderAdvanceType: 'percent', preorderAdvanceMinor: 50000 }), 200000)).toBeNull();
    expect(preorderOffer(live({ preorderEnabled: true, preorderAdvanceType: 'fixed', preorderAdvancePercent: 20 }), 200000)).toBeNull();
    const line = preorderLine(p, preorderOffer(p, 200000)!, en)!;
    expect(line).toContain(money(40000));
    expect(line).toContain(money(160000));
    expect(preorderLine(p, preorderOffer(p)!, en)).toBeNull();
  });

  it('the checkout line names the advance and the amount due, never the order total', () => {
    const c = live({ preorderEnabled: true, preorderAdvanceMinor: 50000 });
    const line = preorderLine(c, { advanceMinor: 50000, percent: null, dueMinor: 150000 }, en)!;
    expect(line).toContain(money(50000));
    expect(line).toContain(money(150000));
    expect(line).not.toContain(money(200000));
    expect(preorderLine(c, { advanceMinor: 50000, percent: null, dueMinor: 150000 }, bn)).toContain(money(150000, bn));
    // Without a total there is no due amount, so no line at all rather than one with a gap.
    expect(preorderLine(c, { advanceMinor: 50000, percent: null, dueMinor: null }, en)).toBeNull();
  });
});

describe('the checks before it can be switched on', () => {
  it('a full set of dates passes', () => {
    expect(eidIssues(live(), { bands: BANDS.map((b) => b.band), districts: [] })).toEqual([]);
  });

  it('names each problem', () => {
    expect(eidIssues(live({ bandDates: [{ band: 'dhaka-city', orderBy: '2027-03-11' }] }))).toContain('DATE_AFTER_EID');
    expect(eidIssues(live(), { bands: ['dhaka-city'] })).toContain('UNKNOWN_BAND');
    expect(eidIssues(live({ districtDates: [{ district: 'bd.sample.x', orderBy: '2027-03-01' }] }), { districts: [] })).toContain('UNKNOWN_DISTRICT');
    expect(eidIssues(live({ bandDates: null, districtDates: [{ district: 'bd.sample.x', orderBy: '2027-03-01' }] }))).not.toContain('NO_DATES');
    expect(eidIssues(live({ preorderEnabled: true }))).toContain('PREORDER_NO_ADVANCE');
    expect(eidIssues(live({ preorderEnabled: true, preorderAdvanceType: 'percent', preorderAdvanceMinor: 50000 }))).toContain('PREORDER_NO_ADVANCE');
    expect(eidIssues(live({ preorderEnabled: true, preorderAdvanceType: 'percent', preorderAdvancePercent: 20 }))).not.toContain('PREORDER_NO_ADVANCE');
    expect(eidIssues(live({ bannerText: { en: 'Order soon — {band}', bn: '{date} {band}' } }))).toContain('BANNER_NEEDS_DATE');
    expect(eidIssues(live({ preorderText: { en: 'Pay {advance} now', bn: '{advance} {due}' } }))).toContain('PREORDER_TEXT_NEEDS_AMOUNTS');
    expect(eidIssues(live({ preorderBannerText: { en: 'Pre-order now', bn: '{advance}' } }))).toContain('PREORDER_BANNER_NEEDS_ADVANCE');
  });

  it('the starting words use only their own tokens, and fill them all', () => {
    const c = defaults();
    for (const [field, tokens] of Object.entries(EID_TEXT_TOKENS)) {
      const t = c[field as keyof typeof EID_TEXT_TOKENS];
      expect(unknownTokens(t.en, tokens)).toEqual([]);
      expect(unknownTokens(t.bn, tokens)).toEqual([]);
    }
    expect(fillEidText('By {date}, {band} {other}', { date: '6 Mar', band: 'Dhaka' })).toBe('By 6 Mar, Dhaka {other}');
  });
});
