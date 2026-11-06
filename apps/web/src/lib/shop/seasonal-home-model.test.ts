// S13 · PR 280 — the seasonal home page's pure rules: a look keeps only values that fit their settings, a window's
// state at a moment, the live window, the overlap rule, and the shop's clock both ways (Asia/Dhaka, UTC+6).
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { liveWindow, lookOf, lookPayload, overlaps, utcToWall, wallToUtc, windowState, withLook } from './seasonal-home-model';

const at = (iso: string) => new Date(iso);

describe('seasonal home model (PR 280)', () => {
  it('reads a home look: only its home keys, only values that fit; anything else is no look', () => {
    const sections = [{ id: 'new-in' as const, on: true }, { id: 'hero' as const, on: true }];
    const look = lookOf(lookPayload({ 'home.sections': sections }));
    expect(look).toEqual({ 'home.sections': sections });
    expect(lookOf({ scope: 'home', settings: { 'home.sections': [{ id: 'nope', on: true }], 'home.newIn': registry['home.newIn'].default, 'shell.footer': {} } })).toEqual({ 'home.newIn': registry['home.newIn'].default });
    for (const p of [null, 'x', {}, { scope: 'launch', settings: { 'home.sections': sections } }, { scope: 'home' }]) expect(lookOf(p)).toEqual({});
    const s = { 'home.sections': registry['home.sections'].default, 'store.name': 'Sample' };
    expect(withLook(s, look)).toEqual({ 'home.sections': sections, 'store.name': 'Sample' });
  });

  it('knows where a window stands, which one is live, and when two share a moment', () => {
    const w = { applyAt: at('2027-03-01T00:00:00Z'), revertAt: at('2027-03-10T00:00:00Z'), status: 'SCHEDULED' };
    expect(windowState(w, at('2027-02-28T23:59:00Z'))).toBe('UPCOMING');
    expect(windowState(w, at('2027-03-01T00:00:00Z'))).toBe('LIVE');
    expect(windowState(w, at('2027-03-10T00:00:00Z'))).toBe('ENDED');
    expect(windowState({ ...w, status: 'STOPPED' }, at('2027-03-05T00:00:00Z'))).toBe('STOPPED');
    expect(windowState({ ...w, revertAt: null }, at('2030-01-01T00:00:00Z'))).toBe('LIVE');
    const later = { applyAt: at('2027-03-05T00:00:00Z'), revertAt: null, status: 'SCHEDULED' };
    expect(liveWindow([w, later], at('2027-03-06T00:00:00Z'))).toBe(later);
    expect(liveWindow([w, { ...later, status: 'STOPPED' }], at('2027-03-06T00:00:00Z'))).toBe(w);
    expect(liveWindow([w], at('2027-04-01T00:00:00Z'))).toBeNull();
    expect(overlaps(w, { applyAt: at('2027-03-10T00:00:00Z'), revertAt: at('2027-03-12T00:00:00Z') })).toBe(false);
    expect(overlaps(w, { applyAt: at('2027-03-09T23:00:00Z'), revertAt: at('2027-03-12T00:00:00Z') })).toBe(true);
    expect(overlaps({ applyAt: at('2027-01-01T00:00:00Z'), revertAt: null }, w)).toBe(true);
  });

  it('reads and writes times on the shop clock; a time that is not real is refused', () => {
    expect(wallToUtc('2027-03-09T18:30', 'Asia/Dhaka')!.toISOString()).toBe('2027-03-09T12:30:00.000Z');
    expect(utcToWall(at('2027-03-09T12:30:00Z'), 'Asia/Dhaka')).toBe('2027-03-09T18:30');
    expect(utcToWall(at('2027-03-09T20:15:00Z'), 'Asia/Dhaka')).toBe('2027-03-10T02:15');
    expect(wallToUtc('', 'Asia/Dhaka')).toBeNull();
    expect(wallToUtc(null, 'Asia/Dhaka')).toBeNull();
    for (const v of ['2027-02-30T10:00', '2027-03-09 18:30', '2027-03-09T24:00', '2027-03-09T10:60', 'soon', 5]) expect(wallToUtc(v, 'Asia/Dhaka')).toBeUndefined();
  });
});
