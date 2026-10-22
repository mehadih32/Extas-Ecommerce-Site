// PR 553 — the charge accuracy guard without a database. (1) The collision suite: every known colliding name in
// collisions.json must settle on its band, or ask with exactly its options — one wrong band fails the build. It runs
// in every sub-area mode the owner can pick, so a mode switch cannot turn a right answer wrong. (2) The guard: a charge
// comes only from a ResolvedArea the resolver minted — a hand-made object, a typed line, another store's answer or an
// ask gets UNRESOLVED or no area at all, never a figure; an off band quotes "not set", never 0.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { BandMap, gazetteerFromRows, isResolvedArea, quoteDelivery, resolveAddress, resolvedAreaOf, type BandConfig, type BandRow, type ResolverOptions } from '../src';
import { sampleGazetteerRows } from '../src/sample';
import collisions from './collisions.json';

interface Case {
  line: string;
  expect: string;
  area?: string;
  reason?: string;
  options?: string[];
}

const g = gazetteerFromRows(sampleGazetteerRows());
const CONFIG: BandConfig = { cityKey: 'dhaka-city', subAreaKey: 'dhaka-sub-area', outsideKey: 'outside-dhaka', cityCorporations: ['DNCC', 'DSCC'] };
const OPTS: ResolverOptions = { minKeyChars: registry['delivery.resolver.minKeyChars'].default, numberLabels: registry['delivery.resolver.numberLabels'].default };
const LIST = collisions.subAreaList.map((areaId) => ({ areaId, bandId: 'id-dhaka-sub-area' }));
const A = 1;

function bands(mode = 'own', outsideOn = true): BandRow[] {
  const b = (key: string, sortOrder: number, chargeMinor: number, extra: Partial<BandRow> = {}): BandRow => ({
    id: `id-${key}`,
    key,
    nameEn: key,
    nameBn: null,
    chargeMinor,
    codLimitMinor: null,
    hoursMin: null,
    hoursMax: null,
    mode: null,
    enabled: true,
    sortOrder,
    ...extra,
  });
  return [b('dhaka-city', 1, 8000), b('dhaka-sub-area', 2, 10000, { mode }), b('outside-dhaka', 3, 13000, { enabled: outsideOn })];
}

/** What a sub-area answer becomes under a mode: the band it is charged as. */
const asMode = (key: string, mode: string) => (key === 'dhaka-sub-area' && mode === 'city' ? 'dhaka-city' : key === 'dhaka-sub-area' && mode === 'outside' ? 'outside-dhaka' : key);

describe('the collision suite (collisions.json)', () => {
  const cases = collisions.cases as Case[];

  it('has the known collisions in it', () => {
    const lines = cases.map((c) => c.line);
    for (const must of [
      'Gabtoli Bus Stand, Dhaka',
      'Masterpara, Gabtali, Bogura',
      'Gabtoli',
      'Gabtoli 1216',
      'Gabtoli 5820',
      'Bogra',
      'Bhogra, Gazipur',
      'Kaliganj',
      'Mirpur, Kushtia',
      'Sreepur, Gazipur',
      'Sripur Magura',
    ]) {
      expect(lines).toContain(must);
    }
  });

  for (const mode of ['own', 'city', 'outside']) {
    const map = new BandMap(g, bands(mode), LIST, CONFIG);
    it.each(cases.map((c) => [c.line, c] as const))(`settles "%s" on its band (sub-area mode ${mode})`, (_line, c) => {
      const r = resolveAddress(map, c.line, OPTS);
      const folded = new Set((c.options ?? []).map((k) => asMode(k, mode)));
      if (c.expect === 'ask' && folded.size === 1) {
        // under this mode every place of the name is charged alike: the charge is sure, the place is not
        expect(r.status).toBe('resolved');
        if (r.status === 'resolved') expect([r.band.key, r.placeSure]).toEqual([[...folded][0], false]);
        return;
      }
      if (c.expect === 'ask') {
        expect(r.status, `"${c.line}" must ask, never guess`).toBe('ask');
        if (r.status !== 'ask') return;
        if (mode === 'own') {
          expect(r.reason).toBe(c.reason);
          expect(r.options.map((o) => o.band.key)).toEqual(c.options);
        }
        return;
      }
      expect(r.status, `"${c.line}" must settle on ${c.expect}`).toBe('resolved');
      if (r.status !== 'resolved') return;
      expect(r.band.key).toBe(asMode(c.expect, mode));
      if (c.area && r.areaId) expect(g.get(r.areaId)?.code).toBe(c.area);
    });
  }
});

describe('a charge only from a resolved place', () => {
  const map = new BandMap(g, bands(), LIST, CONFIG);

  it('quotes the band of the place the line settles on', () => {
    const area = resolvedAreaOf(A, resolveAddress(map, 'Masterpara, Gabtali, Bogura', OPTS))!;
    expect(isResolvedArea(area)).toBe(true);
    expect(quoteDelivery(map, A, area)).toMatchObject({ kind: 'charge', chargeMinor: 13000, band: { key: 'outside-dhaka' } });
    expect(Object.isFrozen(area)).toBe(true);
  });

  it('gives no area for a line that asks: ask, never guess', () => {
    expect(resolvedAreaOf(A, resolveAddress(map, 'Gabtoli', OPTS))).toBeNull();
  });

  it("refuses free text, a figure, a hand-made area and another store's area", () => {
    const real = resolvedAreaOf(A, resolveAddress(map, 'Gabtoli Bus Stand, Dhaka', OPTS))!;
    const forged = { ...real };
    for (const bad of ['Gabtoli Bus Stand, Dhaka', 8000, null, undefined, {}, forged, { storeId: A, areaId: null, bandId: 'id-dhaka-city', via: 'line' }]) {
      expect(() => quoteDelivery(map, A, bad)).toThrow(/UNRESOLVED/);
    }
    expect(() => quoteDelivery(map, 2, real)).toThrow(/UNRESOLVED/);
    expect(() => quoteDelivery(new BandMap(g, [], [], CONFIG), A, real)).toThrow(/UNRESOLVED/);
  });

  it('follows the sub-area mode, and quotes "not set" for an off band — never 0', () => {
    const folded = new BandMap(g, bands('outside'), LIST, CONFIG);
    const savar = resolvedAreaOf(A, resolveAddress(folded, 'Savar', OPTS))!;
    expect(quoteDelivery(folded, A, savar)).toMatchObject({ kind: 'charge', chargeMinor: 13000, band: { key: 'outside-dhaka' } });
    const off = new BandMap(g, bands('own', false), LIST, CONFIG);
    const bogura = resolvedAreaOf(A, resolveAddress(off, 'Bogra', OPTS))!;
    const q = quoteDelivery(off, A, bogura);
    expect(q).toEqual({ kind: 'not-set', band: expect.objectContaining({ key: 'outside-dhaka', priced: false, chargeMinor: null }) });
  });

  it('quotes the band the customer picked when he was asked', () => {
    const r = resolveAddress(map, 'Gabtoli', OPTS, { confirmed: { bandId: 'id-outside-dhaka' } });
    const area = resolvedAreaOf(A, r)!;
    expect(area.via).toBe('choice');
    expect(quoteDelivery(map, A, area)).toMatchObject({ kind: 'charge', chargeMinor: 13000 });
  });
});
