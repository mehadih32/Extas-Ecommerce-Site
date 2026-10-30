// CN-029 Phase 1 · Bhandari's lane (PR 609, 620; registry v65): every key at version 65, labelled in both languages, its
// default valid; nothing here is owner data or moves money, and every optional feature ships off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { bhandariP1Settings } from '../src/registry-bhandari-p1';

describe('Bhandari lane settings (v65)', () => {
  it('every key is in the registry at version 65, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(bhandariP1Settings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(65);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 609: the B-grade name suffix is a store setting with a short default; the floor stays the owner`s (v62)', () => {
    const s = bhandariP1Settings['catalogue.bGrade.nameSuffix'];
    expect([s.scope, s.default, s.schema.safeParse('x'.repeat(61)).success]).toEqual(['store', ' (B grade)', false]);
    expect([registry['catalogue.floor.minMarginPercent'].default, registry['catalogue.bGrade.listing'].default]).toEqual([null, false]);
    // qa-gate (30 Oct): the changed-buying-price list length is a setting.
    const shown = bhandariP1Settings['catalogue.shopPrice.changesShown'];
    expect([shown.scope, shown.default, shown.schema.safeParse(0).success]).toEqual(['installation', 100, false]);
  });

  it('PR 620: the ERP`s calls to the shop are off per store; the contract`s 5 minutes, 20 products and 50 customers a page', () => {
    const s = bhandariP1Settings;
    expect([s['erp.siteApi.enabled'].scope, s['erp.siteApi.enabled'].default]).toEqual(['store', false]);
    expect([s['erp.siteApi.maxAgeSeconds'].default, s['erp.siteApi.topProductsLimit'].default, s['erp.siteApi.customersPageSize'].default]).toEqual([300, 20, 50]);
    // The most a call may ask for is never below the defaults it falls back to.
    expect(s['erp.siteApi.maxRows'].default).toBeGreaterThanOrEqual(Math.max(s['erp.siteApi.topProductsLimit'].default, s['erp.siteApi.customersPageSize'].default));
    expect([s['erp.siteApi.maxRangeDays'].default, s['erp.siteApi.callsShown'].default]).toEqual([366, 20]);
  });

  it('PR 620 (qa-gate 30 Oct): the refusal limits and the search length are installation settings, never 0', () => {
    const s = bhandariP1Settings;
    const keys = ['erp.siteApi.refusedPerMinute', 'erp.siteApi.refusedLogMinutes', 'erp.siteApi.refusedShownDays', 'erp.siteApi.searchMaxChars'] as const;
    expect(keys.map((k) => [s[k].scope, s[k].default])).toEqual([
      ['installation', 60],
      ['installation', 60],
      ['installation', 7],
      ['installation', 100],
    ]);
    for (const k of keys) expect(s[k].schema.safeParse(0).success, k).toBe(false);
  });
});
