// S22 · PR 431 (registry v159): ticketing — at version 159, never owner data, labelled in both languages, off as
// shipped (CN-018), every number bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportTicketsSchema, supportTicketsSettings } from '../src/registry-support-tickets';

const spec = supportTicketsSettings['support.tickets'];

describe('support.tickets setting (v159)', () => {
  it('is in the registry at version 159, store-level, labelled in English and Bengali', () => {
    expect(registry['support.tickets']).toBe(spec);
    expect(spec.version).toBe(159);
    expect(spec.scope).toBe('store');
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
    for (const lang of ['en', 'bn'] as const) for (const k of [spec.labelKey, spec.helpKey!]) expect(lookup(messages[lang], k)).toBeTruthy();
  });

  it('ships off with the 18 Oct round\'s 5-minute first answer; every number is bounded', () => {
    expect(spec.default).toEqual({ enabled: false, firstResponseMinutes: 5, resolutionHours: 24, notify: true });
    for (const bad of [{ enabled: 'yes' }, { extra: 1 }, { firstResponseMinutes: 0 }, { firstResponseMinutes: 1441 }, { firstResponseMinutes: 2.5 }, { resolutionHours: 0 }, { resolutionHours: 721 }, { notify: 1 }])
      expect(supportTicketsSchema.safeParse({ ...spec.default, ...bad }).success, JSON.stringify(bad)).toBe(false);
    expect(supportTicketsSchema.safeParse({ enabled: true, firstResponseMinutes: 1440, resolutionHours: 720, notify: false }).success).toBe(true);
  });
});
