// S22 · PR 427 (registry v155): who is writing in the Support inbox — at version 155, never owner data, labelled in both
// languages, off as shipped (the number from the chat's words and one person across channels are its parts).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportIdentitySchema, supportIdentitySettings } from '../src/registry-support-identity';

const spec = supportIdentitySettings['support.identity'];

describe('support.identity setting (v155)', () => {
  it('is in the registry at version 155, store-level, labelled in English and Bengali', () => {
    expect(registry['support.identity']).toBe(spec);
    expect(spec.version).toBe(155);
    expect(spec.scope).toBe('store');
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) for (const k of [spec.labelKey, spec.helpKey!]) expect(lookup(messages[lang], k)).toBeTruthy();
  });

  it('ships off; its parts are plain switches and nothing else is accepted', () => {
    expect(spec.default).toEqual({ enabled: false, fromText: true, autoLink: true });
    expect(supportIdentitySchema.safeParse({ ...spec.default, enabled: 'yes' }).success).toBe(false);
    expect(supportIdentitySchema.safeParse({ ...spec.default, extra: 1 }).success).toBe(false);
  });
});
