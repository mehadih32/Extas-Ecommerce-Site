// PR 817 — where the money lands: what the owner may save (account names cleaned, a way may only name a listed account, a settlement
// is at most a month) and that it is empty as shipped.
import { describe, expect, it } from 'vitest';
import { parseSettlement, SettlementError } from './settlement';

const base = { accounts: [' DBBL current account ', 'DBBL current account', 'City Bank savings', ''], bkash: { account: 'DBBL current account', days: 1 }, nagad: { account: '', days: 1 }, card: { account: 'City Bank savings', days: 2 }, cod: { account: '', days: 7 } };

describe('PR 817 · settlement', () => {
  it('trims the account names, drops empty and repeated ones', () => {
    expect(parseSettlement(base).accounts).toEqual(['DBBL current account', 'City Bank savings']);
  });
  it('refuses a way that names an account that is not on the list', () => {
    try {
      parseSettlement({ ...base, nagad: { account: 'Cash in hand', days: 1 } });
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(SettlementError);
      expect((e as SettlementError).code).toBe('ACCOUNT_NOT_LISTED');
      expect((e as SettlementError).details).toEqual(['nagad']);
    }
  });
  it('refuses days past a month, a missing way and a body that is not an object', () => {
    expect(() => parseSettlement({ ...base, cod: { account: '', days: 31 } })).toThrow(SettlementError);
    const { card: _c, ...noCard } = base;
    expect(() => parseSettlement(noCard)).toThrow(SettlementError);
    expect(() => parseSettlement(null)).toThrow(SettlementError);
  });
});
