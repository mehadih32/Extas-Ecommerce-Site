// PR 552 — the address autocomplete without a database, over the SAMPLE gazetteer: prefix matching in Bengali, English
// and Banglish (Gabtali = Gabtoli, Sreepur = Sripur, Bogra = Bogura), never fuzzy; each row names its district and its
// band's charge; a place spanning several bands, or a band that is off, shows no charge.
import { describe, expect, it } from 'vitest';
import { BandMap, gazetteerFromRows, matchPlaces, suggestionOf, type AreaOverride, type BandConfig, type BandRow } from '../src';
import { sampleGazetteerRows } from '../src/sample';

const g = gazetteerFromRows(sampleGazetteerRows());
const CONFIG: BandConfig = { cityKey: 'dhaka-city', subAreaKey: 'dhaka-sub-area', outsideKey: 'outside-dhaka', cityCorporations: ['DNCC', 'DSCC'] };
const SUB_LIST: AreaOverride[] = ['bd.dhaka.gazipur', 'bd.dhaka.dhaka.savar'].map((areaId) => ({ areaId, bandId: 'id-dhaka-sub-area' }));

function bands(outsideOn = true): BandRow[] {
  const b = (key: string, sortOrder: number, chargeMinor: number, enabled = true): BandRow => ({
    id: `id-${key}`,
    key,
    nameEn: key,
    nameBn: null,
    chargeMinor,
    codLimitMinor: null,
    hoursMin: null,
    hoursMax: null,
    mode: null,
    enabled,
    sortOrder,
  });
  return [b('dhaka-city', 1, 8000), b('dhaka-sub-area', 2, 10000), b('outside-dhaka', 3, 13000, outsideOn)];
}
const MAP = new BandMap(g, bands(), SUB_LIST, CONFIG);

const rows = (q: string, map = MAP, limit = 8) => matchPlaces(map.gazetteer, q, limit).map((m) => suggestionOf(map, m.entry, m.name));
const line = (q: string, map = MAP) => rows(q, map).map((r) => `${r.place.nameEn}|${r.place.parentEn ?? ''}|${r.band ? `${r.band.key}:${r.band.chargeMinor}` : '-'}`);

describe('address autocomplete', () => {
  it('shows both Gabtolis with their districts and their own charges', () => {
    const both = line('gabt');
    expect(both).toContain('Gabtoli|Dhaka|dhaka-city:8000');
    expect(both).toContain('Gabtali|Bogura|outside-dhaka:13000');
  });

  it('matches the Banglish spellings people type, and Bengali', () => {
    expect(line('gabtali')).toEqual(expect.arrayContaining(['Gabtoli|Dhaka|dhaka-city:8000', 'Gabtali|Bogura|outside-dhaka:13000']));
    expect(line('sripur').some((l) => l.startsWith('Sreepur|'))).toBe(true);
    expect(line('bogra')[0]).toMatch(/^Bogura\|/);
    expect(line('গাবতল').length).toBeGreaterThanOrEqual(2);
  });

  it('matches the start of a name only, never a fuzzy score', () => {
    expect(line('abtoli')).toEqual([]);
    expect(line('xyzq')).toEqual([]);
  });

  it('shows no charge for a place that spans several bands, or a band that is off', () => {
    expect(line('dhaka').find((l) => l.startsWith('Dhaka|'))).toMatch(/\|-$/);
    expect(line('gazipur', MAP).find((l) => l.startsWith('Gazipur|'))).toMatch(/dhaka-sub-area:10000$/);
    const off = new BandMap(g, bands(false), SUB_LIST, CONFIG);
    const r = rows('gabtali', off).find((x) => x.place.parentEn === 'Bogura')!;
    expect(r.band).toMatchObject({ key: 'outside-dhaka', priced: false, chargeMinor: null });
  });

  it('keeps to the limit, each place once', () => {
    const r = rows('g', MAP, 3);
    expect(r).toHaveLength(3);
    expect(new Set(r.map((x) => x.place.id)).size).toBe(3);
  });
});
