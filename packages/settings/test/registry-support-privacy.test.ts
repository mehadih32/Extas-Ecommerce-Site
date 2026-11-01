// S22 · PR 434 (registry v185–186): privacy inside support and the support block list — never owner data, labelled in
// both languages, everything off as shipped (CN-018), strict.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportBlockListSchema, supportPrivacySchema, supportPrivacySettings } from '../src/registry-support-privacy';

const privacy = supportPrivacySettings['support.privacy'];
const block = supportPrivacySettings['support.blockList'];

describe('support.privacy and support.blockList (v185–186)', () => {
  it('are in the registry at versions 185 and 186, store-level, labelled in English and Bengali', () => {
    expect(registry['support.privacy']).toBe(privacy);
    expect(registry['support.blockList']).toBe(block);
    expect([privacy.version, block.version]).toEqual([185, 186]);
    for (const s of [privacy, block]) {
      expect(s.scope).toBe('store');
      expect(s.isOwnerData).toBe(false);
      expect(s.isPublic).toBe(false);
      for (const lang of ['en', 'bn'] as const) for (const k of [s.labelKey, s.helpKey!]) expect(lookup(messages[lang], k)).toBeTruthy();
    }
  });

  it('ship off and take nothing else', () => {
    expect(privacy.default).toEqual({ ownChatsOnly: false, maskNumbersInText: false });
    expect(block.default).toEqual({ enabled: false });
    for (const bad of [{ ownChatsOnly: 'yes' }, { extra: 1 }]) expect(supportPrivacySchema.safeParse({ ...privacy.default, ...bad }).success).toBe(false);
    expect(supportBlockListSchema.safeParse({ enabled: true, auto: true }).success).toBe(false);
  });
});
