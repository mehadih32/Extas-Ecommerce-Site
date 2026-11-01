// S22 · PR 428 (registry v156): the customer beside a support chat — at version 156, never owner data, labelled in both
// languages, on as shipped (B4.5 is locked: the customer's history is always visible beside the chat).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportContextSchema, supportContextSettings } from '../src/registry-support-context';

const spec = supportContextSettings['support.context'];

describe('support.context setting (v156)', () => {
  it('is in the registry at version 156, store-level, labelled in English and Bengali', () => {
    expect(registry['support.context']).toBe(spec);
    expect(spec.version).toBe(156);
    expect(spec.scope).toBe('store');
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) for (const k of [spec.labelKey, spec.helpKey!]) expect(lookup(messages[lang], k)).toBeTruthy();
  });

  it('ships on (B4.5 locked) with three recent orders; the count is 1–10 and nothing else is accepted', () => {
    expect(spec.default).toEqual({ enabled: true, recentOrders: 3 });
    expect(supportContextSchema.safeParse({ ...spec.default, recentOrders: 0 }).success).toBe(false);
    expect(supportContextSchema.safeParse({ ...spec.default, recentOrders: 11 }).success).toBe(false);
    expect(supportContextSchema.safeParse({ ...spec.default, enabled: 'yes' }).success).toBe(false);
    expect(supportContextSchema.safeParse({ ...spec.default, extra: 1 }).success).toBe(false);
  });
});
