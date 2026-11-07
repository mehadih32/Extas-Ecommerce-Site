// Follow-up 565 (PR 618; registry v274): the cost lines written by the imported statements are one store setting, both
// parts off as shipped, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { statementCostsSettings } from '../src/registry-books-statement-costs';

describe('cost lines from the imported statements (v274)', () => {
  it('is in the registry at version 274, off, per store, labelled in English and Bengali', () => {
    const s = statementCostsSettings['books.costs.fromStatements'];
    expect(registry['books.costs.fromStatements']).toBe(s);
    expect([s.version, s.default, s.scope, s.isOwnerData, s.group]).toEqual([274, { courierCharges: false, gatewayFees: false }, 'store', false, 'books']);
    expect(s.schema.safeParse({ courierCharges: true }).success).toBe(false);
    expect(s.schema.safeParse({ courierCharges: true, gatewayFees: false, other: true }).success).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!)).toBeTruthy();
    }
  });
});
