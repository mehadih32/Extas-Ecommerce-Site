// S14 · PR 284 — the Customers pages' words: English and Bengali carry the same keys, every refusal code of the customers
// service has its words, and an unknown code falls back to the general one.
import { describe, expect, it } from 'vitest';
import { ACCESS_ACTIONS, type CustomersErrorCode } from '@extas/customers';
import { MERGE_SIGNALS } from '@extas/settings';
import type { Dict } from '@/lib/i18n';
import bn from '../../../messages/admin-customers.bn.json';
import en from '../../../messages/admin-customers.en.json';
import { cusError, lookWord } from './words';

const keys = (d: unknown, p = ''): string[] =>
  d && typeof d === 'object' ? Object.entries(d as Record<string, unknown>).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p];

const CODES: CustomersErrorCode[] = ['INVALID_INPUT', 'NOT_FOUND', 'SAME_PROFILE', 'ALREADY_MERGED', 'HAS_MERGED', 'NOT_ACTIVE', 'NOTE_REQUIRED', 'ALREADY_UNDONE', 'MOVED_ON', 'KEY_REUSED'];

describe('Customers page words (PR 284)', () => {
  it('English and Bengali have the same keys', () => {
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });
  it('every refusal and every merge rule has words', () => {
    for (const d of [en, bn] as Dict[]) {
      for (const c of CODES) expect(cusError(d, c, 'note')).not.toBe(cusError(d, 'default'));
      for (const s of [...MERGE_SIGNALS, 'manual']) expect(keys(d)).toContain(`cus.signal.${s}`);
    }
    expect(cusError(en as Dict, 'SOMETHING_NEW')).toBe((en as { cus: { err: { default: string } } }).cus.err.default);
    expect(cusError(en as Dict, 'INVALID_INPUT', 'note')).toContain('note');
  });
  it('PR 286: every logged action of "Who looked" has its words, never a raw key', () => {
    for (const d of [en, bn] as Dict[]) {
      const words = ACCESS_ACTIONS.map((a) => lookWord(d, a));
      for (const w of words) expect(w).not.toMatch(/^cus\./);
      expect(new Set(words).size).toBe(ACCESS_ACTIONS.length);
    }
  });
});
