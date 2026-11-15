// PR 787 (lane D1): the claims page search box (prototype "Search claim or order") reaches the query as a trimmed `search`.
import { describe, expect, it } from 'vitest';
import { claimsOverviewQuery } from './claims-overview';

describe('claimsOverviewQuery search', () => {
  it('is optional and trimmed', () => {
    expect(claimsOverviewQuery.parse({}).search).toBeUndefined();
    expect(claimsOverviewQuery.parse({ search: '  ORD-12 ' }).search).toBe('ORD-12');
  });
  it('refuses a very long search', () => {
    expect(claimsOverviewQuery.safeParse({ search: 'x'.repeat(101) }).success).toBe(false);
  });
});
