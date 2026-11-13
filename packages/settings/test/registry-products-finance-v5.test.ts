// S28 · PR 686–691 (admin prototype v5, wave 4): the settings of Products, Finance, Reports and Home — each at its own PR
// number as the registry version, per store, labelled in English and Bengali, defaults that pass their own schema.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { budgetSchema, cashbookSchema, productsFinanceV5Settings, shopRankingSchema } from '../src/registry-products-finance-v5';

describe('wave 4 settings (PR 686–691)', () => {
  it('every key is in the registry, per store, owner-neutral, at a PR number, labelled in both languages, default valid', () => {
    for (const [key, s] of Object.entries(productsFinanceV5Settings)) {
      expect(registry[key as keyof typeof registry], key).toBe(s);
      expect(s.scope, key).toBe('store');
      expect(s.isOwnerData, key).toBe(false);
      expect(s.version, key).toBeGreaterThanOrEqual(686);
      expect(s.version, key).toBeLessThanOrEqual(691);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang} label`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang} help`).toBeTruthy();
      }
    }
  });

  it('shop ranking: the prototype weights, the nightly order off, nothing out of range', () => {
    const d = productsFinanceV5Settings['shop.ranking'].default;
    expect(d.weights).toEqual({ sales: 35, conv: 20, margin: 15, stock: 20, fresh: 10 });
    expect(d.autoApply).toBe(false);
    expect(shopRankingSchema.safeParse({ ...d, weights: { ...d.weights, sales: 51 } }).success).toBe(false);
    expect(shopRankingSchema.safeParse({ ...d, freshDays: 0 }).success).toBe(false);
    expect(shopRankingSchema.safeParse({ ...d, extra: 1 }).success).toBe(false);
  });

  it('cashbook: recording is on (written OK of 13 Nov), a 14-day forecast, cash with the couriers over 5 days', () => {
    const d = productsFinanceV5Settings['books.cash'].default;
    expect(d).toEqual({ enabled: true, forecastDays: 14, codPayoutDays: 5 });
    expect(cashbookSchema.safeParse({ ...d, forecastDays: 0 }).success).toBe(false);
    expect(cashbookSchema.safeParse({ ...d, codPayoutDays: 31 }).success).toBe(false);
    expect(cashbookSchema.safeParse({ ...d, other: 1 }).success).toBe(false);
  });

  it('budgets: warn when the pace reaches the whole budget by default, never below 10%', () => {
    const d = productsFinanceV5Settings['books.budget'].default;
    expect(d).toEqual({ warnAtPct: 100 });
    expect(budgetSchema.safeParse({ warnAtPct: 9 }).success).toBe(false);
    expect(budgetSchema.safeParse({ ...d, extra: 1 }).success).toBe(false);
  });
});
