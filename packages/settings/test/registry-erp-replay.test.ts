// Follow-up 526 (PR 620; registry v238): refusing a reused ERP signature is one installation switch, off as shipped,
// labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { erpReplaySettings } from '../src/registry-erp-replay';

describe('ERP replay switch (v238)', () => {
  it('is in the registry at version 238, off, labelled in English and Bengali', () => {
    const s = erpReplaySettings['erp.siteApi.refuseReplays'];
    expect(registry['erp.siteApi.refuseReplays']).toBe(s);
    expect([s.version, s.default, s.scope, s.isOwnerData]).toEqual([238, false, 'installation', false]);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!)).toBeTruthy();
    }
  });
});
