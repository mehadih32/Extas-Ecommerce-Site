// S13 · PR 274 — the pure part of Orders › Incomplete: stages, hot-first order, the bag's worth (a set counted once at
// its set price), the WhatsApp and call links, the visit's channel and the views. Sample values only.
import { describe, expect, it } from 'vitest';
import { bagValue, callLink, channelOf, hotFirst, stageOf, viewOf, whatsAppLink } from './incomplete-model';

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
