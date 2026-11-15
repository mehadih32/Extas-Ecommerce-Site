// PR 789 — the Store details setting: empty or off as shipped, strict about what the owner may save.
import { describe, expect, it } from 'vitest';
import { registry } from '../src/registry';
import { STORE_DETAILS_DEFAULT, storeDetailsSchema } from '../src/registry-store-details';

describe('PR 789 · store.details', () => {
  it('ships empty (no name, no number, VAT off, no target) and is owner data', () => {
    expect(storeDetailsSchema.safeParse(STORE_DETAILS_DEFAULT).success).toBe(true);
    expect(registry['store.details'].isOwnerData).toBe(true);
    expect(registry['store.details'].default).toBeNull();
    expect(STORE_DETAILS_DEFAULT.showVat).toBe(false);
    expect(STORE_DETAILS_DEFAULT.targetSales).toBe(0);
  });
  it('refuses a bad colour, a bad time, a bad e-mail and a shop that closes before it opens', () => {
    const d = STORE_DETAILS_DEFAULT;
    expect(storeDetailsSchema.safeParse({ ...d, colorMain: 'red' }).success).toBe(false);
    expect(storeDetailsSchema.safeParse({ ...d, colorMain: '#E2552B' }).success).toBe(true);
    expect(storeDetailsSchema.safeParse({ ...d, supportOpens: '25:00' }).success).toBe(false);
    expect(storeDetailsSchema.safeParse({ ...d, supportOpens: '22:00', supportCloses: '10:00' }).success).toBe(false);
    expect(storeDetailsSchema.safeParse({ ...d, supportOpens: '10:00', supportCloses: '22:00' }).success).toBe(true);
    expect(storeDetailsSchema.safeParse({ ...d, ordersEmail: 'nope' }).success).toBe(false);
    expect(storeDetailsSchema.safeParse({ ...d, targetAdPct: 101 }).success).toBe(false);
    expect(storeDetailsSchema.safeParse({ ...d, extra: 1 }).success).toBe(false);
  });
});
