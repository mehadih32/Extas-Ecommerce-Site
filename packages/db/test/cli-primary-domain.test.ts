// S19 · PR 362 follow-up — the typed-confirmation gate of cli-primary-domain.ts, with no database: nothing is ever
// written without the exact phrase (same convention as tools/golive-switch.mjs).
import { describe, expect, it } from 'vitest';
import { confirmPhrase, parseArgs } from '../src/cli-primary-domain';

describe('cli-primary-domain (PR 362 follow-up)', () => {
  it('reads --domain and --confirm', () => {
    expect(parseArgs(['--domain', 'extas.com.bd', '--confirm', 'GO LIVE extas.com.bd'])).toEqual({ domain: 'extas.com.bd', confirm: 'GO LIVE extas.com.bd' });
    expect(parseArgs([])).toEqual({ domain: '', confirm: null });
  });
  it('refuses an unknown argument', () => {
    expect(() => parseArgs(['--oops'])).toThrow(/unknown argument/);
  });
  it('the confirmation phrase names the exact domain', () => {
    expect(confirmPhrase('extas.com.bd')).toBe('GO LIVE extas.com.bd');
  });
});
