// S22 · PR 435 (registry v187): the support app — never owner data, labelled in both languages, off as shipped
// (CN-018), every number editable within its bounds, strict.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportAppSchema, supportAppSettings } from '../src/registry-support-app';

const app = supportAppSettings['support.app'];

describe('support.app (v187)', () => {
  it('is in the registry at version 187, store-level, labelled in English and Bengali', () => {
    expect(registry['support.app']).toBe(app);
    expect(app.version).toBe(187);
    expect(app.scope).toBe('store');
    expect(app.isOwnerData).toBe(false);
    expect(app.isPublic).toBe(false);
    for (const lang of ['en', 'bn'] as const) for (const k of [app.labelKey, app.helpKey!]) expect(lookup(messages[lang], k)).toBeTruthy();
  });

  it('ships off, push off, and refuses what is out of bounds', () => {
    expect(app.default).toEqual({ enabled: false, appName: '', push: false, events: ['message', 'assigned'], preview: 'name', ttlMinutes: 60 });
    expect(supportAppSchema.safeParse(app.default).success).toBe(true);
    for (const bad of [{ ttlMinutes: 0 }, { ttlMinutes: 1441 }, { preview: 'all' }, { events: ['message', 'message'] }, { events: ['late'] }, { appName: 'x'.repeat(41) }, { extra: 1 }])
      expect(supportAppSchema.safeParse({ ...app.default, ...bad }).success).toBe(false);
  });
});
