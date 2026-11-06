// S13 · PR 281 — the festive rule's words on the shop (festive.ts): open before a band's last order time with the short
// words, closed after it with the "after" words (or nothing), every band without an address, one band with it, only
// live rules at their own places; the owner's dates filled in, nothing invented.
import { describe, expect, it } from 'vitest';
import { ALL_SCOPE, ALWAYS, festiveCuts, festiveLinesOf, festiveState, type Rule, type RuleContent } from '../src/pure';

let n = 0;
function festive(c: Partial<RuleContent> = {}, extra: Partial<Rule> = {}): Rule {
  n++;
  return {
    key: `festive-${n}`,
    kind: 'festive',
    nameEn: 'Eid cut-off',
    nameBn: 'ঈদের শেষ সময়',
    text: {
      short: { en: 'Order by {city} for delivery before Eid', bn: 'ঈদের আগে পেতে {city}-এর মধ্যে অর্ডার করুন' },
      after: { en: 'Orders placed now arrive after Eid.', bn: 'এখন অর্ডার করলে ঈদের পরে পৌঁছাবে।' },
    },
    params: [
      { key: 'city', type: 'datetime', value: '2027-03-06T23:59:00+06:00', labelEn: 'city' },
      { key: 'out', type: 'datetime', value: '2027-03-04T23:59:00+06:00', labelEn: 'out' },
    ],
    scope: ALL_SCOPE,
    conditions: ALWAYS,
    actions: [{ type: 'cutoff', byBand: { 'dhaka-city': 'city', 'outside-dhaka': 'out' } }],
    placements: ['announcement', 'product', 'checkout'],
    priority: 0,
    stackable: false,
    status: 'ACTIVE',
    startsAt: null,
    endsAt: null,
    id: `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`,
    version: 1,
    archived: false,
    ...c,
    ...extra,
  } as Rule;
}

const ctx = { locale: 'en-BD', currency: 'BDT', timeZone: 'Asia/Dhaka' };
const bnCtx = { ...ctx, locale: 'bn-BD' };
const BEFORE = new Date('2027-03-03T12:00:00Z');
const BETWEEN = new Date('2027-03-05T12:00:00Z'); // outside Dhaka passed, Dhaka city still open
const AFTER = new Date('2027-03-07T12:00:00Z');

describe('festiveCuts / festiveState', () => {
  it('reads each band time and leaves out an empty one', () => {
    const r = festive({ params: [{ key: 'city', type: 'datetime', value: '2027-03-06T23:59:00+06:00', labelEn: 'c' }, { key: 'out', type: 'datetime', value: null, labelEn: 'o' }] });
    expect(festiveCuts(r)).toEqual([{ band: 'dhaka-city', at: '2027-03-06T23:59:00+06:00' }]);
  });

  it('without a band: open while any time is ahead (the nearest next), closed once all passed', () => {
    const cuts = festiveCuts(festive());
    expect(festiveState(cuts, null, BEFORE)).toEqual({ state: 'open', next: '2027-03-04T23:59:00+06:00' });
    expect(festiveState(cuts, null, BETWEEN)).toEqual({ state: 'open', next: '2027-03-06T23:59:00+06:00' });
    expect(festiveState(cuts, null, AFTER)).toEqual({ state: 'closed' });
  });

  it('with a band: only its own time (or every band with *), none for a band the rule does not name', () => {
    const cuts = festiveCuts(festive());
    expect(festiveState(cuts, 'outside-dhaka', BETWEEN).state).toBe('closed');
    expect(festiveState(cuts, 'dhaka-city', BETWEEN).state).toBe('open');
    expect(festiveState(cuts, 'dhaka-sub-area', BETWEEN).state).toBe('none');
    expect(festiveState([{ band: '*', at: '2027-03-04T00:00:00Z' }], 'dhaka-sub-area', BETWEEN).state).toBe('closed');
    expect(festiveState([], null, BEFORE).state).toBe('none');
  });
});

describe('festiveLinesOf', () => {
  it('open: the short words with the owner date filled in, in the asked language with the rule name', () => {
    const r = festive();
    const [en] = festiveLinesOf([r], { placement: 'announcement', band: null, now: BEFORE }, ctx);
    expect(en).toMatchObject({ key: r.key, name: 'Eid cut-off', state: 'open' });
    expect(en!.text).toMatch(/^Order by .*6.* for delivery before Eid$/);
    const [bn] = festiveLinesOf([r], { placement: 'announcement', band: null, now: BEFORE }, bnCtx);
    expect(bn!.name).toBe('ঈদের শেষ সময়');
    expect(bn!.text).toContain('ঈদের আগে পেতে');
  });

  it('closed: the after words; with no after words written, nothing', () => {
    expect(festiveLinesOf([festive()], { placement: 'product', band: null, now: AFTER }, ctx)).toEqual([expect.objectContaining({ text: 'Orders placed now arrive after Eid.', state: 'closed' })]);
    const noAfter = festive({ text: { short: { en: 'Order by {city}' } } });
    expect(festiveLinesOf([noAfter], { placement: 'product', band: null, now: AFTER }, ctx)).toEqual([]);
  });

  it('checkout asks only for closed lines of the settled band', () => {
    const r = festive();
    expect(festiveLinesOf([r], { placement: 'checkout', band: 'outside-dhaka', now: BETWEEN, want: 'closed' }, ctx).map((l) => l.state)).toEqual(['closed']);
    expect(festiveLinesOf([r], { placement: 'checkout', band: 'dhaka-city', now: BETWEEN, want: 'closed' }, ctx)).toEqual([]);
  });

  it('skips a rule not placed here, not live, paused, archived, not festive, or with no time at all', () => {
    const now = BEFORE;
    const ask = { placement: 'announcement', band: null, now };
    expect(festiveLinesOf([festive({ placements: ['product'] })], ask, ctx)).toEqual([]);
    expect(festiveLinesOf([festive({}, { startsAt: '2027-03-04T00:00:00Z' } as Partial<Rule>)], ask, ctx)).toEqual([]);
    expect(festiveLinesOf([festive({}, { status: 'PAUSED' } as Partial<Rule>)], ask, ctx)).toEqual([]);
    expect(festiveLinesOf([festive({}, { archived: true })], ask, ctx)).toEqual([]);
    expect(festiveLinesOf([festive({ kind: 'discount' } as Partial<RuleContent>)], ask, ctx)).toEqual([]);
    expect(festiveLinesOf([festive({ actions: [] })], ask, ctx)).toEqual([]);
  });

  it('a short text whose date is empty is not drawn (no half sentence)', () => {
    const r = festive({ text: { short: { en: 'Order by {out}' } }, actions: [{ type: 'cutoff', byBand: { 'dhaka-city': 'city' } }], params: [{ key: 'city', type: 'datetime', value: '2027-03-06T23:59:00+06:00', labelEn: 'c' }, { key: 'out', type: 'datetime', value: null, labelEn: 'o' }] });
    expect(festiveLinesOf([r], { placement: 'announcement', band: null, now: BEFORE }, ctx)).toEqual([]);
  });
});
