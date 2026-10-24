// S04 · PR 566 / 606 (registry v38): every key at version 38, never owner data, labelled in both languages, its default valid;
// the words for the customer use only their own {tokens} and carry no amount typed into them.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { bulkLaneSchema, EXPLAIN_TOKENS, orderExplainSchema, supportLaneSettings } from '../src/registry-support-lane';
import { tokensOf } from '../src/schemas';

describe('support explanation and bulk lane settings (v38)', () => {
  it('every key is in the registry at version 38, never owner data, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(supportLaneSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(38);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 566: the panel reads only; the words for the customer use their own tokens and no typed figure', () => {
    const d = supportLaneSettings['orders.explain'].default;
    expect(d.enabled).toBe(true);
    for (const [k, v] of Object.entries(d.say)) {
      for (const lang of ['en', 'bn'] as const) {
        expect(tokensOf(v[lang]).every((x) => (EXPLAIN_TOKENS as readonly string[]).includes(x)), `${k} ${lang}`).toBe(true);
        expect(/\d/.test(v[lang].replace(/\{\w+\}/g, '')), `${k} ${lang} has a typed number`).toBe(false);
      }
    }
    expect(orderExplainSchema.safeParse({ ...d, say: { ...d.say, chargeBand: { en: 'Pay {score}', bn: 'x' } } }).success).toBe(false);
    expect(orderExplainSchema.safeParse({ ...d, say: { ...d.say, chargeBand: { en: '', bn: 'x' } } }).success).toBe(false);
  });

  it('PR 606: the bulk lane ships off, with none of the owner\'s numbers (minimum, logo price, advance) set', () => {
    const d = supportLaneSettings['orders.bulkLane'].default;
    expect(d.enabled).toBe(false);
    expect(d.minQuantity).toBeNull();
    expect(d.bag.atPieces).toBeNull();
    expect(d.logo.priceMinor).toBeNull();
    expect(d.advance).toEqual({ type: 'none', amountMinor: null, percent: null });
    expect(bulkLaneSchema.safeParse({ ...d, minQuantity: 50, maxQuantity: 10 }).success).toBe(false);
    expect(bulkLaneSchema.safeParse({ ...d, minQuantity: 10, maxQuantity: 10 }).success).toBe(true);
    expect(bulkLaneSchema.safeParse({ ...d, perDay: 0 }).success).toBe(false);
  });
});
