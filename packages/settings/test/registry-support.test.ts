// S22 · PR 425 (registry v63): the support inbox and files in a conversation — version 63 in the Support group, never
// owner data, labelled in both languages, defaults valid. Optional behaviour is off by default (CN-018): taking a
// conversation on reply is a switch the owner turns on. Customer numbers follow customers.phoneMask (PR 284).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportAttachmentsSchema, supportInboxSchema, supportSettings } from '../src/registry-support';

describe('support settings (v63)', () => {
  it('every key is in the registry at version 63 in the Support group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(supportSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(63);
      expect(spec.group, key).toBe('support');
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], 'groups.support'), lang).toBeTruthy();
      }
    }
  });

  it('optional behaviour ships off; the numbers stay inside their ranges', () => {
    expect(supportSettings['support.inbox'].default).toMatchObject({ assignOnReply: false, waitingOnReply: true });
    expect(Object.keys(supportSettings)).toEqual(['support.inbox', 'support.attachments']);
    expect(supportInboxSchema.safeParse({ ...supportSettings['support.inbox'].default, pageSize: 5 }).success).toBe(false);
    const a = supportSettings['support.attachments'].default;
    expect(supportAttachmentsSchema.safeParse({ ...a, maxMb: 0 }).success).toBe(false);
    expect(supportAttachmentsSchema.safeParse({ ...a, kinds: { ...a.kinds, exe: true } }).success).toBe(false);
  });
});
