// S13 · PR 274 — the pure part of Orders › Incomplete: stages, hot-first order, the bag's worth (a set counted once at
// its set price), the WhatsApp and call links, the visit's channel and the views. Sample values only.
import { describe, expect, it } from 'vitest';
import {
  bagValue,
  callLink,
  channelOf,
  dayKey,
  fillTemplate,
  hotFirst,
  newestFirst,
  rangeBounds,
  rangeOf,
  smsLink,
  stageOf,
  viewOf,
  whatsAppLink,
  whatsAppTextLink,
  zoneOffsetMinutes,
} from './incomplete-model';

describe('PR 274 · incomplete-order model', () => {
  it('reads the checkout step as a stage and lists the hottest first, then the newest', () => {
    expect([stageOf('details'), stageOf('delivery'), stageOf('payment'), stageOf(null), stageOf('odd')]).toEqual(['phone', 'address', 'payment', 'phone', 'phone']);
    const at = (m: number) => new Date(Date.UTC(2026, 10, 6, 8, m));
    const rows = [
      { id: 'a', stage: 'phone' as const, lastAt: at(50) },
      { id: 'b', stage: 'payment' as const, lastAt: at(10) },
      { id: 'c', stage: 'address' as const, lastAt: at(20) },
      { id: 'd', stage: 'payment' as const, lastAt: at(30) },
    ];
    expect(hotFirst(rows).map((r) => r.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it("counts the bag at its own prices, a set once at its set price", () => {
    expect(bagValue([])).toBe(0);
    expect(
      bagValue([
        { quantity: 2, unitPriceMinor: 150_000, comboGroupKey: null, setPriceMinor: null },
        { quantity: 1, unitPriceMinor: 120_000, comboGroupKey: 'set-1', setPriceMinor: 200_000 },
        { quantity: 1, unitPriceMinor: 110_000, comboGroupKey: 'set-1', setPriceMinor: 200_000 },
        { quantity: 1, unitPriceMinor: 90_000, comboGroupKey: 'set-2', setPriceMinor: null },
      ]),
    ).toBe(300_000 + 200_000 + 90_000);
  });

  it('makes the WhatsApp and call links from the kept number', () => {
    expect(whatsAppLink('+8801700000274')).toBe('https://wa.me/8801700000274');
    expect(callLink('+8801700000274')).toBe('tel:+8801700000274');
  });

  it('names the visit that brought him, or nothing', () => {
    expect(channelOf({ attribution: { adPlatform: 'META', utmSource: 'facebook', utmCampaign: 'eid-polo', utmMedium: null } }, false)).toEqual({ platform: 'META', source: 'facebook', campaign: 'eid-polo', landing: false });
    expect(channelOf({ attribution: { adPlatform: null, utmSource: ' ', utmCampaign: null } }, true)).toEqual({ platform: null, source: null, campaign: null, landing: true });
    expect(channelOf({ attribution: {} }, false)).toBeNull();
    expect(channelOf(null, false)).toBeNull();
    expect(channelOf('x', false)).toBeNull();
  });

  it('reads the view from the address, open by default', () => {
    expect([viewOf('mine'), viewOf(['handled']), viewOf('all'), viewOf(undefined)]).toEqual(['mine', 'handled', 'open', 'open']);
  });
});

describe('PR 668 · incomplete orders v5 (pure part)', () => {
  const DHAKA = 360; // sample offset: UTC+6
  const now = new Date(Date.UTC(2026, 10, 13, 20, 0)); // 02:00 on the 14th in UTC+6
  it('knows the later view and reads the range from the address', () => {
    expect(viewOf('later')).toBe('later');
    expect(rangeOf('yesterday')).toBe('yesterday');
    expect(rangeOf('nonsense')).toBe('all');
  });
  it('cuts days in the shop clock, not in UTC', () => {
    const today = rangeBounds('today', now, DHAKA)!;
    expect(today.from.toISOString()).toBe('2026-11-13T18:00:00.000Z');
    expect(today.to.toISOString()).toBe('2026-11-14T18:00:00.000Z');
    expect(rangeBounds('yesterday', now, DHAKA)!.to.toISOString()).toBe(today.from.toISOString());
    expect(rangeBounds('week', now, DHAKA)!.from.toISOString()).toBe('2026-11-07T18:00:00.000Z');
    expect(rangeBounds('month', now, DHAKA)!.from.toISOString()).toBe('2026-10-31T18:00:00.000Z');
    const last = rangeBounds('lastMonth', now, DHAKA)!;
    expect(last.from.toISOString()).toBe('2026-09-30T18:00:00.000Z');
    expect(last.to.toISOString()).toBe('2026-10-31T18:00:00.000Z');
    expect(rangeBounds('all', now, DHAKA)).toBeNull();
    expect(dayKey(new Date('2026-11-13T19:00:00Z'), DHAKA)).toBe('2026-11-14');
  });
  it('takes a custom range inclusive of its last day, and refuses a backwards or unreadable one', () => {
    const r = rangeBounds('custom', now, 0, { from: '2026-11-01', to: '2026-11-03' })!;
    expect(r.from.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-11-04T00:00:00.000Z');
    expect(rangeBounds('custom', now, 0, { from: '2026-11-05', to: '2026-11-03' })).toBeNull();
    expect(rangeBounds('custom', now, 0, { from: 'x', to: null })).toBeNull();
  });
  it('lists the newest first, whatever the stage', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 10, 6, 8, m));
    expect(
      newestFirst([
        { id: 'a', lastAt: at(1) },
        { id: 'b', lastAt: at(9) },
        { id: 'c', lastAt: at(5) },
      ]).map((r) => r.id),
    ).toEqual(['b', 'c', 'a']);
  });
  it('fills the ready messages, drops unknown words and never prints a brace', () => {
    expect(fillTemplate('Hello {name}, your {items} {link}', { name: 'Rafi', items: 'Polo', link: null })).toBe('Hello Rafi, your Polo');
    expect(fillTemplate('Offer: {offer}.', { offer: '' })).toBe('Offer:.');
    expect(fillTemplate('{name}!', { name: 'A' })).toBe('A!');
    expect(fillTemplate('x {other}', {})).toBe('x {other}');
  });
  it('opens WhatsApp or SMS with the words in the box (nothing is sent)', () => {
    expect(whatsAppTextLink('+8801700000000', 'Hi there')).toBe(`${whatsAppLink('+8801700000000')}?text=Hi%20there`);
    expect(smsLink('+880 1700-000000', 'a b')).toBe('sms:+8801700000000?body=a%20b');
  });
  it('reads a shop zone as an offset', () => {
    expect(zoneOffsetMinutes('Asia/Dhaka', now)).toBe(360);
    expect(zoneOffsetMinutes('Not/AZone', now)).toBe(0);
  });
});
