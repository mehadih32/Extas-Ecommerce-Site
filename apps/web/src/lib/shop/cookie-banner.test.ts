// PR 743 — the cookie banner's rules (no database).
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { beaconsAllowed, bannerShows, choiceCookie, choiceOf, CONSENT_NO, CONSENT_YES } from './cookie-banner';

const off = registry['cookie.banner'].default;
const on = { ...off, on: true, declineStops: false };
const stops = { ...on, declineStops: true };

describe('cookie banner rules (PR 743)', () => {
  it('is off as shipped: nothing drawn, every beacon runs', () => {
    expect(off.on).toBe(false);
    expect(bannerShows(off, null)).toBe(false);
    expect(beaconsAllowed(off, CONSENT_NO)).toBe(true);
  });
  it('shows only while on and no choice is remembered', () => {
    expect(bannerShows(on, null)).toBe(true);
    expect(bannerShows(on, CONSENT_YES)).toBe(false);
    expect(bannerShows(on, CONSENT_NO)).toBe(false);
  });
  it('a No stops the beacons only when the owner asked for it', () => {
    expect(beaconsAllowed(on, CONSENT_NO)).toBe(true);
    expect(beaconsAllowed(stops, CONSENT_NO)).toBe(false);
    expect(beaconsAllowed(stops, CONSENT_YES)).toBe(true);
    expect(beaconsAllowed(stops, null)).toBe(true);
  });
  it('reads a cookie value and writes the owner`s days', () => {
    expect(choiceOf('yes')).toBe('yes');
    expect(choiceOf('junk')).toBeNull();
    expect(choiceOf(undefined)).toBeNull();
    expect(choiceCookie(CONSENT_YES, 2)).toContain('Max-Age=172800');
  });
});
