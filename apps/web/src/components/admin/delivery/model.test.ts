// S06 · PR 550 — the delivery page's pure part: a band as text (an off band shows "not set", never a figure), the
// sub-area band's "charged as", a place's line, refusals in the screen's words, and the band form's one PATCH. PR 551 — the
// "Try an address" lines: a place with its district, an off band shows no figure, and the question names the places.
// PR 502 — the COD limit in the form and as text, a folded sub-area band switched on without its own charge, the
// spellings box as a list.
import { describe, expect, it } from 'vitest';
import type { BandOut, BandView, PlaceView, ResolveView } from '@extas/delivery';
import type { Dict } from '@/lib/i18n';
import bn from '../../../../messages/admin-delivery.bn.json';
import en from '../../../../messages/admin-delivery.en.json';
import { moneyOf } from '../products/model';
import { aliasesOf, askLine, bandForm, bandPatch, chargedAsText, chargeText, codText, hoursText, optionLine, outCharge, placeLabel, placeLine, refusalText } from './model';

const d = { delivery: en } as unknown as Dict;
const money = moneyOf('BDT', 'en-BD');

function band(over: Partial<BandView> = {}): BandView {
  return {
    id: 'b1',
    key: 'dhaka-city',
    nameEn: 'Inside Dhaka City',
    nameBn: null,
    role: 'city',
    chargeMinor: 0,
    codLimitMinor: null,
    hoursMin: 24,
    hoursMax: 48,
    mode: null,
    enabled: false,
    sortOrder: 10,
    chargedAs: { id: 'b1', key: 'dhaka-city', role: 'city', enabled: false },
    listed: 0,
    ...over,
  };
}

function keys(o: unknown, at = ''): string[] {
  return o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, at ? `${at}.${k}` : k)) : [at];
}

describe('the delivery page as text', () => {
  it('has every message in both languages', () => {
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });

  it('shows "not set" for a band that is off, the figure once it is on', () => {
    expect(chargeText(d, band(), money)).toBe(en.bands.notSet);
    expect(chargeText(d, band({ enabled: true, chargeMinor: 8000 }), money)).toMatch(/80/);
    expect(chargeText(d, band({ enabled: true, chargeMinor: 0 }), money)).toMatch(/0/);
  });

  it('writes the hours as a range, one figure, or none', () => {
    expect(hoursText(d, band(), 'en')).toBe('24–48 hours');
    expect(hoursText(d, band({ hoursMin: 24, hoursMax: 24 }), 'en')).toBe('24 hours');
    expect(hoursText(d, band({ hoursMin: null, hoursMax: 72 }), 'en')).toBe('72 hours');
    expect(hoursText(d, band({ hoursMin: null, hoursMax: null }), 'en')).toBe(en.bands.noHours);
  });

  it('says what the sub-area band is charged as when it is folded', () => {
    const sub = band({ role: 'subArea', key: 'dhaka-sub-area', mode: 'city', chargedAs: { id: 'b1', key: 'dhaka-city', role: 'city', enabled: true } });
    expect(chargedAsText(d, sub)).toBe(en.bands.chargedAs.city);
    expect(chargedAsText(d, { ...sub, chargedAs: { ...sub.chargedAs, role: 'subArea' } })).toBe('');
    expect(chargedAsText(d, band())).toBe('');
  });

  it('names the level and the district of a place', () => {
    expect(placeLine(d, 'en', { level: 'UPAZILA', parentEn: 'Bogura', parentBn: 'বগুড়া' })).toBe('Upazila · Bogura');
    expect(placeLine({ delivery: bn } as unknown as Dict, 'bn', { level: 'UPAZILA', parentEn: 'Bogura', parentBn: 'বগুড়া' })).toBe('উপজেলা · বগুড়া');
    expect(placeLine(d, 'en', { level: 'DIVISION', parentEn: null, parentBn: null })).toBe('Division');
  });

  it("turns refusals into the screen's words, never the server's", () => {
    expect(refusalText(d, 'CHARGE_REQUIRED')).toBe(en.errors.CHARGE_REQUIRED);
    expect(refusalText(d, 'INVALID_INPUT', ['hoursMin: too small'])).toBe('Please check: the fastest time.');
    expect(refusalText(d, 'SOMETHING_NEW')).toBe(en.errors['server-error']);
  });
});

describe('the band form', () => {
  it('starts empty for an off band and from the saved figures for an on band', () => {
    expect(bandForm(band(), money)).toMatchObject({ charge: '', hoursMin: '24', hoursMax: '48', enabled: false });
    expect(bandForm(band({ enabled: true, chargeMinor: 8000 }), money).charge).toBe('80');
  });

  it('sends the charge together with switching on, and only what changed', () => {
    const b = band();
    expect(bandPatch(b, { ...bandForm(b, money), enabled: true, charge: '80' }, money)).toEqual({ patch: { chargeMinor: 8000, enabled: true }, error: null });
    expect(bandPatch(b, { ...bandForm(b, money), enabled: true, charge: '' }, money).error).toBe('badCharge');
    expect(bandPatch(b, { ...bandForm(b, money), charge: 'eighty' }, money).error).toBe('badCharge');
    expect(bandPatch(b, bandForm(b, money), money)).toEqual({ patch: {}, error: null });
    const on = band({ enabled: true, chargeMinor: 8000 });
    expect(bandPatch(on, { ...bandForm(on, money), charge: '90' }, money).patch).toEqual({ chargeMinor: 9000 });
    expect(bandPatch(on, { ...bandForm(on, money), enabled: false }, money).patch).toEqual({ enabled: false });
  });

  it('checks the hours before sending', () => {
    const b = band();
    expect(bandPatch(b, { ...bandForm(b, money), hoursMin: '72', hoursMax: '24' }, money).error).toBe('badHours');
    expect(bandPatch(b, { ...bandForm(b, money), hoursMin: '1.5' }, money).error).toBe('badHours');
    expect(bandPatch(b, { ...bandForm(b, money), hoursMin: '' }, money).patch).toEqual({ hoursMin: null });
  });

  it('PR 502: the COD limit — empty is no limit, a number is sent once, anything else is refused before sending', () => {
    const b = band();
    expect(bandForm(band({ codLimitMinor: 300000 }), money).codLimit).toBe('3000');
    expect(bandPatch(b, { ...bandForm(b, money), codLimit: '3000' }, money).patch).toEqual({ codLimitMinor: 300000 });
    expect(bandPatch(b, { ...bandForm(b, money), codLimit: 'lots' }, money).error).toBe('badCod');
    const limited = band({ codLimitMinor: 300000 });
    expect(bandPatch(limited, { ...bandForm(limited, money), codLimit: '' }, money).patch).toEqual({ codLimitMinor: null });
    expect(codText(d, b, money)).toBe(en.bands.codNone);
    expect(codText(d, limited, money)).toMatch(/3,000/);
  });

  it('PR 502: the sub-area band charged as the city switches on without a charge of its own', () => {
    const sub = band({ role: 'subArea', key: 'dhaka-sub-area', mode: 'city' });
    expect(bandPatch(sub, { ...bandForm(sub, money), enabled: true }, money)).toEqual({ patch: { enabled: true }, error: null });
    const own = band({ role: 'subArea', key: 'dhaka-sub-area', mode: 'own' });
    expect(bandPatch(own, { ...bandForm(own, money), enabled: true }, money).error).toBe('badCharge');
  });

  it('PR 502: the spellings box is one per line (or commas), blanks dropped', () => {
    expect(aliasesOf(' Gabtoli \n\nগাবতলি, gabtali ')).toEqual(['Gabtoli', 'গাবতলি', 'gabtali']);
    expect(aliasesOf('')).toEqual([]);
  });

  it('sends the mode only for the sub-area band', () => {
    const sub = band({ role: 'subArea', mode: 'own' });
    expect(bandPatch(sub, { ...bandForm(sub, money), mode: 'outside' }, money).patch).toEqual({ mode: 'outside' });
    expect(bandPatch(band(), { ...bandForm(band(), money), mode: 'outside' }, money).patch).toEqual({});
  });
});

describe('"Try an address" as text', () => {
  const out = (over: Partial<BandOut> = {}): BandOut => ({
    id: 'b1',
    key: 'dhaka-city',
    nameEn: 'Inside Dhaka City',
    nameBn: 'ঢাকা সিটির ভেতরে',
    role: 'city',
    priced: false,
    chargeMinor: null,
    hoursMin: 24,
    hoursMax: 48,
    ...over,
  });
  const place = (over: Partial<PlaceView> = {}): PlaceView => ({ id: 'p1', code: null, level: 'AREA', nameEn: 'Gabtoli', nameBn: 'গাবতলী', parentEn: 'Dhaka', parentBn: 'ঢাকা', cityCorporation: 'DNCC', ...over });
  const ask = (reason: 'two-places' | 'wide-place' | 'no-place' | 'changed', options: { band: BandOut; places: PlaceView[] }[]): Extract<ResolveView, { status: 'ask' }> => ({ status: 'ask', reason, options, clues: [] });

  it('names a place with its district, in the chosen language', () => {
    expect(placeLabel('en', place())).toBe('Gabtoli (Dhaka)');
    expect(placeLabel('bn', place())).toBe('গাবতলী (ঢাকা)');
    expect(placeLabel('bn', place({ nameBn: null, parentBn: null }))).toBe('Gabtoli (Dhaka)');
    expect(placeLabel('en', place({ parentEn: null }))).toBe('Gabtoli');
  });

  it('never shows a figure for a band that is off', () => {
    expect(outCharge(d, out(), money)).toBe(en.try.notSet);
    expect(outCharge(d, out({ priced: false, chargeMinor: 8000 }), money)).toBe(en.try.notSet);
    expect(outCharge(d, out({ priced: true, chargeMinor: 8000 }), money)).toMatch(/80/);
    expect(optionLine(d, out({ priced: true, chargeMinor: 8000 }), money, 'en')).toMatch(/80.* · 24–48 hours$/);
  });

  it('asks with the two places named, like the demo checkout', () => {
    const city = { band: out(), places: [place()] };
    const outside = { band: out({ id: 'b3', key: 'outside-dhaka', nameEn: 'Outside Dhaka', role: 'outside' }), places: [place({ id: 'p2', nameEn: 'Gabtali', nameBn: 'গাবতলী', parentEn: 'Bogura', parentBn: 'বগুড়া' })] };
    expect(askLine(d, 'en', ask('two-places', [city, outside]))).toBe('We can see Gabtoli (Dhaka) and Gabtali (Bogura) in it — which one is right?');
    expect(askLine(d, 'en', ask('wide-place', [city, outside]))).toMatch(/^Gabtoli \(Dhaka\) holds more than one band/);
    expect(askLine(d, 'en', ask('no-place', [city, outside]))).toBe(en.try.none);
    expect(askLine(d, 'en', ask('changed', [city, outside]))).toBe('The address now reads as Gabtali (Bogura), but Inside Dhaka City was chosen. Which one is right?');
  });
});
