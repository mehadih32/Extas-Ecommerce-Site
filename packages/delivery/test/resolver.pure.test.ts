// PR 551 — the resolver without a database, over the SAMPLE gazetteer: it reads the whole line, the district settles
// it silently, a postcode settles it (never a house number), names outside the written district are thrown out, only a
// line still ambiguous asks (naming both places), a saved address outranks a guess, a confirmed choice is never changed
// silently. And the settle controller: nothing is read while typing; blur reads at once; a pause reads; typing again
// resumes the wait (every pause has a tested resume).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from '@extas/settings';
import { BandMap, createSettle, gazetteerFromRows, readClues, readLine, resolveAddress, type AreaOverride, type BandConfig, type BandRow, type LineRead, type ResolverOptions } from '../src';
import { sampleGazetteerRows } from '../src/sample';

const g = gazetteerFromRows(sampleGazetteerRows());
const CONFIG: BandConfig = { cityKey: 'dhaka-city', subAreaKey: 'dhaka-sub-area', outsideKey: 'outside-dhaka', cityCorporations: ['DNCC', 'DSCC'] };
const OPTS: ResolverOptions = { minKeyChars: registry['delivery.resolver.minKeyChars'].default, numberLabels: registry['delivery.resolver.numberLabels'].default };
const SUB_LIST: AreaOverride[] = ['bd.dhaka.gazipur', 'bd.dhaka.narayanganj', 'bd.dhaka.dhaka.savar', 'bd.dhaka.dhaka.keraniganj'].map((areaId) => ({ areaId, bandId: 'id-dhaka-sub-area' }));

function bands(mode = 'own'): BandRow[] {
  const b = (key: string, sortOrder: number, extra: Partial<BandRow> = {}): BandRow => ({
    id: `id-${key}`,
    key,
    nameEn: key,
    nameBn: null,
    chargeMinor: sortOrder,
    codLimitMinor: null,
    hoursMin: null,
    hoursMax: null,
    mode: null,
    enabled: true,
    sortOrder,
    ...extra,
  });
  return [b('dhaka-city', 1), b('dhaka-sub-area', 2, { mode }), b('outside-dhaka', 3)];
}
const MAP = new BandMap(g, bands(), SUB_LIST, CONFIG);

/** The band key a line settles on, or "ask:<reason>:<band keys>". */
function band(line: string, map = MAP): string {
  const r = readLine(map, line, OPTS);
  return r.status === 'resolved' ? r.band.key : `ask:${r.reason}:${r.options.map((o) => o.band.key).join('+')}`;
}
const resolved = (r: LineRead) => {
  if (r.status !== 'resolved') throw new Error(`expected a sure read, got ${r.reason}`);
  return r;
};

describe('reading the clues', () => {
  it('finds the longest names first and never uses a word twice', () => {
    const c = readClues(g, 'Ashulia Bazar, Savar, Dhaka', OPTS);
    expect(c.map((x) => x.text)).toEqual(['ashulia bazar', 'savar', 'dhaka']);
  });

  it('takes a 4-digit postcode, but not a house, road or sector number', () => {
    expect(
      readClues(g, 'Road 3, 1216', OPTS)
        .filter((c) => c.postcode)
        .map((c) => c.text),
    ).toEqual(['1216']);
    expect(readClues(g, 'House 1216, Road 5', OPTS).filter((c) => c.postcode)).toEqual([]);
    expect(readClues(g, 'বাসা ১২১৬, রোড ৫', OPTS).filter((c) => c.postcode)).toEqual([]);
    expect(readClues(g, 'ঢাকা ১২১৬', OPTS).find((c) => c.postcode)?.text).toBe('1216'); // Bengali digits read
  });
});

describe('the whole line decides', () => {
  it('lets the district written later settle a colliding name, silently', () => {
    expect(band('Gabtoli Bus Stand, Dhaka')).toBe('dhaka-city');
    expect(band('Naruamala, Gabtoli, Bogura')).toBe('outside-dhaka');
    expect(resolved(readLine(MAP, 'Masterpara, Gabtali, Bogura', OPTS)).area.code).toBe('bd.rajshahi.bogura.gabtali');
    expect(band('গাবতলী, বগুড়া')).toBe('outside-dhaka');
    expect(band('Sreepur, Gazipur')).toBe('dhaka-sub-area');
    expect(band('Sripur Magura')).toBe('outside-dhaka');
    expect(band('Kaliganj, Gazipur')).toBe('dhaka-sub-area');
    expect(band('Kaliganj Jhenaidah')).toBe('outside-dhaka');
    expect(band('Mirpur, Kushtia')).toBe('outside-dhaka');
    expect(band('Uttara, Dhaka')).toBe('dhaka-city');
  });

  it('lets a postcode settle it: 1216 is Dhaka, 5820 Bogura', () => {
    expect(band('House 12, Road 3, 1216')).toBe('dhaka-city');
    expect(band('Gabtoli 5820')).toBe('outside-dhaka');
    expect(band('Gabtoli 1216')).toBe('dhaka-city');
    expect(band('House 1216, Road 5, Bogura')).toBe('outside-dhaka');
  });

  it('prefers the district a line names over a neighbourhood of the same spelling (Bogra = Bogura, not Bhogra)', () => {
    expect(band('Bogra')).toBe('outside-dhaka');
    expect(band('Bhogra, Gazipur')).toBe('dhaka-sub-area');
  });

  it("reads the owner's sub-area list and the city map", () => {
    expect(band('Savar')).toBe('dhaka-sub-area');
    expect(band('Baipail, Ashulia')).toBe('dhaka-sub-area');
    expect(band('Tongi')).toBe('dhaka-sub-area');
    expect(band('Diabari, Uttara')).toBe('dhaka-city');
  });

  it('charges the most specific name that agrees with the most official one', () => {
    const r = resolved(readLine(MAP, 'Baipail, Ashulia, Savar', OPTS));
    expect(r.area.code).toBe('bd.dhaka.dhaka.savar.ashulia.baipail');
    expect(r.placeSure).toBe(true);
  });

  it('asks only when the line is still ambiguous, naming both places', () => {
    const r = readLine(MAP, 'Gabtoli', OPTS);
    expect(r.status).toBe('ask');
    if (r.status !== 'ask') return;
    expect(r.reason).toBe('two-places');
    expect(r.options.map((o) => [o.band.key, o.places.map((p) => p.code)])).toEqual([
      ['dhaka-city', ['bd.dhaka.dhaka.gabtoli']],
      ['outside-dhaka', ['bd.rajshahi.bogura.gabtali']],
    ]);
    expect(band('Mirpur')).toBe('ask:two-places:dhaka-city+outside-dhaka');
    expect(band('Sreepur')).toBe('ask:two-places:dhaka-sub-area+outside-dhaka');
    expect(band('Kaliganj')).toBe('ask:two-places:dhaka-sub-area+outside-dhaka');
  });

  it('asks which band when the place holds several ("Dhaka" alone), and when there is no place at all', () => {
    expect(band('Dhaka')).toBe('ask:wide-place:dhaka-city+dhaka-sub-area+outside-dhaka');
    expect(band('')).toBe('ask:no-place:dhaka-city+dhaka-sub-area+outside-dhaka');
    expect(band('Flat 4B, near the mosque')).toBe('ask:no-place:dhaka-city+dhaka-sub-area+outside-dhaka');
  });

  it('does not ask when two places of a name are charged alike (the charge is sure, the place is not)', () => {
    const noList = new BandMap(g, bands(), [], CONFIG);
    const r = resolved(readLine(noList, 'Sreepur', OPTS));
    expect([r.band.key, r.placeSure]).toEqual(['outside-dhaka', false]);
  });

  it('follows the sub-area mode', () => {
    expect(band('Savar', new BandMap(g, bands('city'), SUB_LIST, CONFIG))).toBe('dhaka-city');
    expect(band('Dhaka', new BandMap(g, bands('city'), SUB_LIST, CONFIG))).toBe('ask:wide-place:dhaka-city+outside-dhaka');
  });
});

describe('what the checkout already knows', () => {
  const gabtaliBogura = g.byCode('bd.rajshahi.bogura.gabtali')!.id;
  const chattogram = g.byCode('bd.chattogram')!.id;

  it('lets a saved address outrank a guess, never a sure read', () => {
    expect(resolveAddress(MAP, 'Gabtoli', OPTS, { savedAreaId: gabtaliBogura })).toMatchObject({ status: 'resolved', via: 'saved', band: { key: 'outside-dhaka' }, areaId: gabtaliBogura });
    expect(resolveAddress(MAP, 'Gabtoli Bus Stand, Dhaka', OPTS, { savedAreaId: gabtaliBogura })).toMatchObject({ status: 'resolved', via: 'line', band: { key: 'dhaka-city' } });
    // a saved place that is not one of the choices does not decide
    expect(resolveAddress(MAP, 'Gabtoli', OPTS, { savedAreaId: g.byCode('bd.dhaka.gazipur')!.id }).status).toBe('ask');
    expect(resolveAddress(MAP, 'Gabtoli', OPTS, { savedAreaId: 'no-such-place' }).status).toBe('ask');
    expect(resolveAddress(MAP, '', OPTS, { savedAreaId: chattogram })).toMatchObject({ status: 'resolved', via: 'saved' });
  });

  it('keeps what the customer confirmed, and asks again when a sure read disagrees', () => {
    const confirmed = { bandId: 'id-dhaka-city' };
    expect(resolveAddress(MAP, 'Gabtoli', OPTS, { confirmed })).toMatchObject({ status: 'resolved', via: 'choice', band: { key: 'dhaka-city' }, areaId: null });
    expect(resolveAddress(MAP, 'Gabtoli Bus Stand, Dhaka', OPTS, { confirmed })).toMatchObject({ status: 'resolved', via: 'line', band: { key: 'dhaka-city' } });
    const changed = resolveAddress(MAP, 'Gabtali, Bogura', OPTS, { confirmed });
    expect(changed.status).toBe('ask');
    if (changed.status === 'ask') {
      expect(changed.reason).toBe('changed');
      expect(changed.options.map((o) => o.band.key)).toEqual(['dhaka-city', 'outside-dhaka']);
    }
    // a picked place is kept with the band only when it really is in that band
    const dhakaGabtoli = g.byCode('bd.dhaka.dhaka.gabtoli')!.id;
    expect(resolveAddress(MAP, 'Gabtoli', OPTS, { confirmed: { bandId: 'id-dhaka-city', areaId: dhakaGabtoli } })).toMatchObject({ areaId: dhakaGabtoli, placeSure: true });
    expect(resolveAddress(MAP, 'Gabtoli', OPTS, { confirmed: { bandId: 'id-dhaka-city', areaId: gabtaliBogura } })).toMatchObject({ areaId: null });
    expect(resolveAddress(MAP, 'Gabtoli', OPTS, { confirmed: { bandId: 'id-gone' } }).status).toBe('ask');
  });
});

describe('the settle controller: it waits for the whole line', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const make = () => {
    const reads: [string, string][] = [];
    const c = createSettle({ settleMs: 900, minWords: 2, onSettle: (line, why) => reads.push([line, why]) });
    return { c, reads };
  };

  it('reads nothing while the customer is typing, then reads after the pause', () => {
    const { c, reads } = make();
    c.input('Gabtoli');
    vi.advanceTimersByTime(5000);
    expect(reads).toEqual([]); // one word: no pause counts yet
    c.input('Gabtoli Bus');
    vi.advanceTimersByTime(899);
    expect(reads).toEqual([]);
    expect(c.waiting).toBe(true);
    c.input('Gabtoli Bus Stand'); // typing again restarts the wait
    vi.advanceTimersByTime(600);
    c.input('Gabtoli Bus Stand, Dhaka');
    vi.advanceTimersByTime(899);
    expect(reads).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(reads).toEqual([['Gabtoli Bus Stand, Dhaka', 'pause']]);
    expect(c.waiting).toBe(false);
  });

  it('resumes after a pause: more typing leads to a new read after the next pause', () => {
    const { c, reads } = make();
    c.input('Gabtali Bogura');
    vi.advanceTimersByTime(900);
    c.input('Gabtali Bogura 5820');
    vi.advanceTimersByTime(900);
    expect(reads.map((r) => r[0])).toEqual(['Gabtali Bogura', 'Gabtali Bogura 5820']);
  });

  it('reads at once on blur, even one word, and never the same line twice in a row', () => {
    const { c, reads } = make();
    c.input('Gabtoli');
    c.blur();
    expect(reads).toEqual([['Gabtoli', 'blur']]);
    c.blur();
    c.input('Gabtoli ');
    vi.advanceTimersByTime(5000);
    expect(reads).toHaveLength(1);
    c.reset();
    c.blur();
    expect(reads).toHaveLength(2);
  });

  it('cancels a waiting read on blur (one read, not two) and stops after dispose', () => {
    const { c, reads } = make();
    c.input('Savar Dhaka');
    c.blur();
    vi.advanceTimersByTime(2000);
    expect(reads).toEqual([['Savar Dhaka', 'blur']]);
    c.input('Savar Dhaka EPZ');
    c.dispose();
    vi.advanceTimersByTime(2000);
    c.blur();
    expect(reads).toHaveLength(1);
  });

  it('ignores an empty line', () => {
    const { c, reads } = make();
    c.input('   ');
    c.blur();
    expect(reads).toEqual([]);
  });
});
