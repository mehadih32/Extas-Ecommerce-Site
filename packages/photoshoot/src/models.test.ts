// S24 · PR 445 — the pure helper: whether a model's consent is valid right now.
import { describe, expect, it } from 'vitest';
import { hasValidConsent } from './models';

describe('hasValidConsent', () => {
  it('is true when a consent record never expires', () => {
    expect(hasValidConsent([{ expiresAt: null }])).toBe(true);
  });

  it('is true when a consent record expires in the future', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(hasValidConsent([{ expiresAt: new Date('2027-01-01T00:00:00Z') }], now)).toBe(true);
  });

  it('is false when the only consent record already expired', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(hasValidConsent([{ expiresAt: new Date('2025-01-01T00:00:00Z') }], now)).toBe(false);
  });

  it('is true when any one of several records is still valid', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(
      hasValidConsent(
        [{ expiresAt: new Date('2025-01-01T00:00:00Z') }, { expiresAt: new Date('2027-01-01T00:00:00Z') }],
        now,
      ),
    ).toBe(true);
  });

  it('is false with no consent records at all', () => {
    expect(hasValidConsent([])).toBe(false);
  });

  it('expiry is exclusive: exactly at the expiry instant it no longer counts', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(hasValidConsent([{ expiresAt: now }], now)).toBe(false);
  });
});
