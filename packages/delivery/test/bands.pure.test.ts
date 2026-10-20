// PR 550 — the band map without a database, over the SAMPLE gazetteer: Dhaka City is the DNCC + DSCC map and nothing
// else, the owner's list is the only exception (the nearest listed place wins), everywhere else is the outside band;
// the sub-area band follows its mode; a band switched off is never "priced"; a place's span says whether it settles
// the charge by itself. Also: the default pack's band keys are the settings' defaults, and prefix place matching.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { BandMap, gazetteerFromRows, matchPlaces, type AreaOverride, type BandConfig, type BandRow } from '../src';
import { sampleGazetteerRows } from '../src/sample';

const g = gazetteerFromRows(sampleGazetteerRows());
const at = (code: string) => {
  const e = g.byCode(code);
  if (!e) throw new Error(`sample has no ${code}`);
  return e;
};

const CONFIG: BandConfig = { cityKey: 'dhaka-city', subAreaKey: 'dhaka-sub-area', outsideKey: 'outside-dhaka', cityCorporations: ['DNCC', 'DSCC'] };

function band(key: string, over: Partial<BandRow> = {}): BandRow {
  return { id: `id-${key}`, key, nameEn: key, nameBn: null, chargeMinor: 0, codLimitMinor: null, hoursMin: null, hoursMax: null, mode: null, enabled: false, sortOrder: 0, ...over };
}

function bands(mode: string | null = 'own', enabled = true): BandRow[] {
  return [
    band('dhaka-city', { chargeMinor: 1, enabled, sortOrder: 1 }),
    band('dhaka-sub-area', { chargeMinor: 2, enabled, sortOrder: 2, mode }),
    band('outside-dhaka', { chargeMinor: 3, enabled, sortOrder: 3 }),
  ];
}

const SUB_LIST: AreaOverride[] = ['bd.dhaka.gazipur', 'bd.dhaka.narayanganj', 'bd.dhaka.dhaka.savar', 'bd.dhaka.dhaka.keraniganj'].map((areaId) => ({ areaId, bandId: 'id-dhaka-sub-area' }));

describe('the band map', () => {
  it('puts a DNCC / DSCC place (or a place under one) in the city band, and nothing else', () => {
    const m = new BandMap(g, bands(), [], CONFIG);
    expect(m.bandOf(at('bd.dhaka.dhaka.mirpur'))).toMatchObject({ role: 'city', via: 'city-map', priced: true, listedAreaId: null });
    expect(m.bandOf(at('bd.dhaka.dhaka.gandaria'))?.role).toBe('city');
    expect(m.bandOf(at('bd.dhaka.dhaka.gabtoli'))?.role).toBe('city');
    // Dhaka district itself is not the city: only the corporations' map is
    expect(m.bandOf(at('bd.dhaka.dhaka'))).toMatchObject({ role: 'outside', via: 'outside' });
    expect(m.bandOf(at('bd.dhaka.dhaka.savar'))?.role).toBe('outside'); // not listed yet → the flat band
  });

  it('sends the colliding names to their own bands', () => {
    const m = new BandMap(g, bands(), SUB_LIST, CONFIG);
    expect(m.bandOf(at('bd.dhaka.dhaka.gabtoli'))?.role).toBe('city');
    expect(m.bandOf(at('bd.rajshahi.bogura.gabtali'))?.role).toBe('outside');
    expect(m.bandOf(at('bd.dhaka.gazipur.sreepur'))?.role).toBe('subArea');
    expect(m.bandOf(at('bd.khulna.magura.sreepur'))?.role).toBe('outside');
    expect(m.bandOf(at('bd.dhaka.dhaka.mirpur'))?.role).toBe('city');
    expect(m.bandOf(at('bd.khulna.kushtia.mirpur'))?.role).toBe('outside');
  });

  it('lets the owner\'s list override the map, the nearest listed place winning', () => {
    const list: AreaOverride[] = [...SUB_LIST, { areaId: 'bd.dhaka.gazipur.sreepur', bandId: 'id-outside-dhaka' }, { areaId: 'bd.dhaka.dhaka.mirpur', bandId: 'id-dhaka-sub-area' }];
    const m = new BandMap(g, bands(), list, CONFIG);
    expect(m.bandOf(at('bd.dhaka.gazipur.sreepur'))).toMatchObject({ role: 'outside', via: 'owner-list', listedAreaId: 'bd.dhaka.gazipur.sreepur' });
    expect(m.bandOf(at('bd.dhaka.gazipur.gazipur-sadar.tongi'))).toMatchObject({ role: 'subArea', via: 'owner-list', listedAreaId: 'bd.dhaka.gazipur' });
    expect(m.bandOf(at('bd.dhaka.dhaka.mirpur'))).toMatchObject({ role: 'subArea', via: 'owner-list' });
    expect(m.bandOf(at('bd.dhaka.dhaka.savar.ashulia'))).toMatchObject({ role: 'subArea', listedAreaId: 'bd.dhaka.dhaka.savar' });
  });

  it('ignores a list entry whose band the store does not have', () => {
    const m = new BandMap(g, bands(), [{ areaId: 'bd.dhaka.gazipur', bandId: 'id-gone' }], CONFIG);
    expect(m.bandOf(at('bd.dhaka.gazipur'))?.via).toBe('outside');
  });

  it('charges the sub-area band by its mode: own, as the city, as outside', () => {
    const own = new BandMap(g, bands('own'), SUB_LIST, CONFIG).bandOf(at('bd.dhaka.dhaka.savar'))!;
    expect([own.role, own.chargedRole, own.charged.chargeMinor]).toEqual(['subArea', 'subArea', 2]);
    const city = new BandMap(g, bands('city'), SUB_LIST, CONFIG).bandOf(at('bd.dhaka.dhaka.savar'))!;
    expect([city.role, city.chargedRole, city.charged.chargeMinor]).toEqual(['subArea', 'city', 1]);
    const out = new BandMap(g, bands('outside'), SUB_LIST, CONFIG).bandOf(at('bd.dhaka.dhaka.savar'))!;
    expect([out.role, out.chargedRole, out.charged.chargeMinor]).toEqual(['subArea', 'outside', 3]);
    const unknown = new BandMap(g, bands('nonsense'), SUB_LIST, CONFIG).bandOf(at('bd.dhaka.dhaka.savar'))!;
    expect(unknown.chargedRole).toBe('subArea'); // anything else reads as "own"
  });

  it('never prices a band that is switched off (the default pack ships all three off)', () => {
    const m = new BandMap(g, bands('own', false), SUB_LIST, CONFIG);
    expect(m.bandOf(at('bd.dhaka.dhaka.mirpur'))?.priced).toBe(false);
    expect(m.bandOf(at('bd.rajshahi.bogura.gabtali'))?.priced).toBe(false);
  });

  it('answers null when the store has no band row for the place', () => {
    const m = new BandMap(g, [band('dhaka-city', { enabled: true })], [], CONFIG);
    expect(m.bandOf(at('bd.rajshahi.bogura'))).toBeNull();
    expect(m.bandOf(at('bd.dhaka.dhaka.mirpur'))?.role).toBe('city');
  });

  it('follows the settings: other band keys, other city corporations', () => {
    const rows = [band('metro', { enabled: true }), band('rest', { enabled: true })];
    const m = new BandMap(g, rows, [], { cityKey: 'metro', subAreaKey: 'none', outsideKey: 'rest', cityCorporations: ['DSCC'] });
    expect(m.bandOf(at('bd.dhaka.dhaka.gandaria'))?.band.key).toBe('metro');
    expect(m.bandOf(at('bd.dhaka.dhaka.mirpur'))?.band.key).toBe('rest'); // DNCC is not in the list now
  });

  it('knows whether a place settles the charge by itself (its span)', () => {
    const m = new BandMap(g, bands(), SUB_LIST, CONFIG);
    expect(m.spanOf(at('bd.rajshahi.bogura')).size).toBe(1);
    expect(m.spanOf(at('bd.dhaka.gazipur')).size).toBe(1);
    expect([...m.spanOf(at('bd.dhaka.dhaka'))].sort()).toEqual(['id-dhaka-city', 'id-dhaka-sub-area', 'id-outside-dhaka']);
    // folded into the city, the sub-area band is not a separate charge any more
    const folded = new BandMap(g, bands('city'), SUB_LIST, CONFIG);
    expect([...folded.spanOf(at('bd.dhaka.dhaka'))].sort()).toEqual(['id-dhaka-city', 'id-outside-dhaka']);
  });

  it('offers each charged band once, in order, as the customer\'s choices', () => {
    expect(new BandMap(g, bands('own'), [], CONFIG).choices().map((b) => b.key)).toEqual(['dhaka-city', 'dhaka-sub-area', 'outside-dhaka']);
    expect(new BandMap(g, bands('outside'), [], CONFIG).choices().map((b) => b.key)).toEqual(['dhaka-city', 'outside-dhaka']);
    const m = new BandMap(g, bands(), [], CONFIG);
    expect(m.choices(new Set(['id-outside-dhaka'])).map((b) => b.key)).toEqual(['outside-dhaka']);
  });
});

describe('settings and the default pack agree', () => {
  it('the band keys in the settings are the default pack\'s three bands', () => {
    const pack = JSON.parse(readFileSync(new URL('../../seed/data/default-pack.json', import.meta.url), 'utf8')) as { deliveryBands: { key: string; mode?: string }[] };
    const keys = pack.deliveryBands.map((b) => b.key);
    for (const k of ['delivery.bands.cityKey', 'delivery.bands.subAreaKey', 'delivery.bands.outsideKey'] as const) expect(keys).toContain(registry[k].default);
    // no mode in the pack reads as "own" (bands.ts chargedBand)
    expect([undefined, 'own']).toContain(pack.deliveryBands.find((b) => b.key === registry['delivery.bands.subAreaKey'].default)?.mode);
  });
});

describe('prefix place matching', () => {
  it('matches English, Bengali, aliases and the loose spelling, by prefix only', () => {
    expect(matchPlaces(g, 'gabtoli', 10).map((m) => m.entry.code)).toEqual(expect.arrayContaining(['bd.dhaka.dhaka.gabtoli', 'bd.rajshahi.bogura.gabtali']));
    expect(matchPlaces(g, 'bogra', 10).map((m) => m.entry.code)).toContain('bd.rajshahi.bogura');
    expect(matchPlaces(g, 'বগুড়া', 10).map((m) => m.entry.code)).toContain('bd.rajshahi.bogura');
    expect(matchPlaces(g, 'sripur', 10).map((m) => m.entry.code)).toEqual(expect.arrayContaining(['bd.dhaka.gazipur.sreepur', 'bd.khulna.magura.sreepur']));
    expect(matchPlaces(g, 'savar', 10)[0]?.entry.code).toBe('bd.dhaka.dhaka.savar');
    expect(matchPlaces(g, 'avar', 50).map((m) => m.entry.code)).not.toContain('bd.dhaka.dhaka.savar'); // never a middle match
  });

  it('lists each place once, whole names and bigger places first, within the limit', () => {
    const hits = matchPlaces(g, 'bogura', 5);
    expect(hits[0]?.entry.code).toBe('bd.rajshahi.bogura');
    expect(new Set(hits.map((h) => h.entry.id)).size).toBe(hits.length);
    expect(matchPlaces(g, 'b', 3)).toHaveLength(3);
    expect(matchPlaces(g, '', 5)).toEqual([]);
    expect(matchPlaces(g, '   ', 5)).toEqual([]);
  });
});
