// S06 · PR 550 — the delivery page's pure part: a band as text (an off band shows "not set", never a figure), the
// sub-area band's "charged as", a place's line, refusals in the screen's words, and the band form's one PATCH.
import { describe, expect, it } from 'vitest';
import type { BandView } from '@extas/delivery';
import type { Dict } from '@/lib/i18n';
import bn from '../../../../messages/admin-delivery.bn.json';
import en from '../../../../messages/admin-delivery.en.json';
import { moneyOf } from '../products/model';
import { bandForm, bandPatch, chargedAsText, chargeText, hoursText, placeLine, refusalText } from './model';

const d = { delivery: en } as unknown as Dict;
const money = moneyOf('BDT', 'en-BD');

function band(over: Partial<BandView> = {}): BandView {
  return { id: 'b1', key: 'dhaka-city', nameEn: 'Inside Dhaka City', nameBn: null, role: 'city', chargeMinor: 0, codLimitMinor: null, hoursMin: 24, hoursMax: 48, mode: null, enabled: false, sortOrder: 10, chargedAs: { id: 'b1', key: 'dhaka-city', role: 'city', enabled: false }, listed: 0, ...over };
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

  it('turns refusals into the screen\'s words, never the server\'s', () => {
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

  it('sends the mode only for the sub-area band', () => {
    const sub = band({ role: 'subArea', mode: 'own' });
    expect(bandPatch(sub, { ...bandForm(sub, money), mode: 'outside' }, money).patch).toEqual({ mode: 'outside' });
    expect(bandPatch(band(), { ...bandForm(band(), money), mode: 'outside' }, money).patch).toEqual({});
  });
});
