// S18 · PR 379 (registry v74): the quiet bot check — every key at version 74, labelled in both languages, its default
// valid; it can only observe (there is no blocking mode to switch on: the owner's rule, nothing blocks automatically).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { BOT_MODES, botCheckSettings } from '../src/registry-bot-check';

describe('bot check settings (v74)', () => {
  it('every key is in the registry at version 74, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(botCheckSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(74);
      expect(s.group, key).toBe('security');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('observe or off only — no mode that refuses or blocks', () => {
    expect([...BOT_MODES]).toEqual(['off', 'observe']);
    expect(botCheckSettings['security.bot.mode'].default).toBe('observe');
  });
});
