// CN-029 Phase 2 · Prohori's lane (PR 619; registry v70): every key at version 70, labelled in both languages, its
// default valid; nothing here is owner data or needs the owner's OK (the switch itself is `erp.model`, which does).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { switchoverSettings } from '../src/registry-switchover';

describe('switch-over settings (v70)', () => {
  it('every key is in the registry at version 70, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(switchoverSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(70);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      expect((s as { requiresOwnerOk?: boolean }).requiresOwnerOk ?? false, key).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 619: the switch is still the owner`s (`erp.model` needs his written OK); a dry run counts for 24 hours; a waiting v5 order is sent again as v6', () => {
    expect([registry['erp.model'].requiresOwnerOk, registry['erp.model'].default]).toEqual([true, null]);
    const s = switchoverSettings;
    expect([s['erp.switchOver.dryRunMaxHours'].scope, s['erp.switchOver.dryRunMaxHours'].default]).toEqual(['installation', 24]);
    expect(s['erp.switchOver.dryRunMaxHours'].schema.safeParse(0).success).toBe(false);
    expect([s['erp.switchOver.queuedV5Orders'].scope, s['erp.switchOver.queuedV5Orders'].default]).toEqual(['store', 'resend']);
    expect(s['erp.switchOver.queuedV5Orders'].schema.safeParse('hold').success).toBe(true);
    expect(s['erp.link.listShown'].default).toBe(20);
  });
});
