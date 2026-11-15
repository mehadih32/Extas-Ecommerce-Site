// PR 817 — Telegram control: the pairing code (hashed, short-lived, constant-time), the account list, and what a save may carry.
import { describe, expect, it } from 'vitest';
import { TELEGRAM_ACCOUNTS_MAX } from '@extas/settings';
import { ControlError, hashCode, pairMatches, PAIR_MINUTES, parseControl, withAccount } from './telegram-control';

const NOW = new Date('2026-11-15T10:00:00Z');
const until = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();

describe('PR 817 · pairing code', () => {
  it('matches only the live code, only once the hash is kept (never the code itself)', () => {
    const cfg = { pairHash: hashCode('123456'), pairUntil: until(PAIR_MINUTES) };
    expect(cfg.pairHash).not.toContain('123456');
    expect(pairMatches(cfg, '123456', NOW)).toBe(true);
    expect(pairMatches(cfg, '654321', NOW)).toBe(false);
  });
  it('stops working after its minutes, and when there is no code', () => {
    expect(pairMatches({ pairHash: hashCode('123456'), pairUntil: until(-1) }, '123456', NOW)).toBe(false);
    expect(pairMatches({ pairHash: null, pairUntil: null }, '123456', NOW)).toBe(false);
  });
  it('refuses anything that is not six digits (a PIN-like text is never taken as a code)', () => {
    const cfg = { pairHash: hashCode('1234'), pairUntil: until(5) };
    expect(pairMatches(cfg, '1234', NOW)).toBe(false);
    expect(pairMatches(cfg, 'abcdef', NOW)).toBe(false);
  });
});

describe('PR 817 · allowed accounts', () => {
  it('adds a chat once and never past the top', () => {
    const one = withAccount([], { id: '5218840193', who: 'Rafi', role: 'Staff' });
    expect(withAccount(one, { id: '5218840193', who: 'Rafi again', role: 'Staff' })).toHaveLength(1);
    let list = one;
    for (let i = 0; i < TELEGRAM_ACCOUNTS_MAX + 3; i++) list = withAccount(list, { id: String(100000 + i), who: `P${i}`, role: 'Staff' });
    expect(list).toHaveLength(TELEGRAM_ACCOUNTS_MAX);
  });
});

describe('PR 817 · what a save may carry', () => {
  it('takes any of the report and alert choices', () => {
    expect(parseControl({ reportTime: '21:30', alerts: { down: true } })).toEqual({ reportTime: '21:30', alerts: { down: true } });
    expect(parseControl({ bigOrderOverMinor: 1_000_000 }).bigOrderOverMinor).toBe(1_000_000);
  });
  it('refuses an empty body, a bad time, an unknown alert and the pairing fields (they have their own routes)', () => {
    for (const bad of [{}, { reportTime: '25:00' }, { alerts: { nope: true } }, { pairHash: 'x' }, { accounts: [] }, null]) {
      expect(() => parseControl(bad)).toThrow(ControlError);
    }
  });
});
