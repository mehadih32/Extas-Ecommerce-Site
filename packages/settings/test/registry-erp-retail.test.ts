// CN-033 (registry v72, CN-031 lane A): the shop follows the ERP's retail decisions of 30 Oct 2026. Every key at
// version 72, labelled in both languages, its default valid; nothing here is owner data or needs the owner's OK.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { ERP_SWITCH_MODES, erpRetailSettings } from '../src/registry-erp-retail';

describe('the ERP retail decisions (CN-033, v72)', () => {
  it('every key is in the registry at version 72, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(erpRetailSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(72);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      expect((s as { requiresOwnerOk?: boolean }).requiresOwnerOk ?? false, key).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 619: a store switches as a fresh start unless it chooses the ERP`s list (the earlier way, kept whole)', () => {
    const s = erpRetailSettings['erp.switchOver.mode'];
    expect([s.scope, s.default, s.valueType]).toEqual(['store', 'fresh-start', 'ENUM']);
    expect(ERP_SWITCH_MODES).toEqual(['fresh-start', 'erp-list']);
    expect(s.schema.safeParse('erp-list').success).toBe(true);
    expect(s.schema.safeParse('moved-orders').success).toBe(false);
  });

  it('PR 610: B-grade order lines are closed per store until the ERP opens them (on = the earlier behaviour)', () => {
    const s = erpRetailSettings['erp.orders.bGradeOpen'];
    expect([s.scope, s.default, s.valueType]).toEqual(['store', false, 'BOOLEAN']);
  });
});
