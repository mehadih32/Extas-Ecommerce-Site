// PR 1180 — practice mode shows Calendar, Customer groups, Quick replies and Export as on, for reads only.
import { describe, expect, it } from 'vitest';
import type { AppResolver } from '../settings';
import { PRACTICE_SHOWN_ON, practiceOn, practiceShownDeps, practiceShownResolver, shownOnlyByPractice, shownValue } from './shown-on';

function fake(values: Record<string, unknown>): AppResolver & { writes: number } {
  const r = {
    writes: 0,
    async value(key: string) {
      return values[key];
    },
    async get(key: string) {
      return { key, value: values[key], source: 'store' };
    },
    async set() {
      r.writes += 1;
      return { changed: true };
    },
  };
  return r as unknown as AppResolver & { writes: number };
}

describe('practice shows the off-by-default features as on', () => {
  it('lists exactly the four features of the owner decision', () => {
    expect([...PRACTICE_SHOWN_ON]).toEqual(['marketing.calendar', 'customers.segments', 'support.savedReplies', 'customers.export']);
  });

  it('turns `enabled` on only while practice is on and only for the listed keys', () => {
    expect(shownValue('marketing.calendar', { enabled: false, days: 60 }, true)).toEqual({ enabled: true, days: 60 });
    expect(shownValue('marketing.calendar', { enabled: false, days: 60 }, false)).toEqual({ enabled: false, days: 60 });
    expect(shownValue('customers.journeys', { enabled: false }, true)).toEqual({ enabled: false });
    expect(shownValue('customers.export', null, true)).toBeNull();
  });

  it('the wrapped resolver reads practice mode and leaves other keys and writes alone', async () => {
    const raw = fake({ 'practice.enabled': { on: true }, 'support.savedReplies': { enabled: false, maxChars: 1000 }, 'store.currency': 'BDT' });
    const r = practiceShownResolver(raw);
    expect(await r.value('support.savedReplies' as never, { storeId: 1 })).toEqual({ enabled: true, maxChars: 1000 });
    expect((await r.get('support.savedReplies' as never, { storeId: 1 })).value).toEqual({ enabled: true, maxChars: 1000 });
    expect(await r.value('store.currency' as never, { storeId: 1 })).toBe('BDT');
    // the stored value is untouched
    expect(await raw.value('support.savedReplies' as never)).toEqual({ enabled: false, maxChars: 1000 });
    expect(raw.writes).toBe(0);
    expect(await practiceOn(raw, 1)).toBe(true);
  });

  it('with practice off every page reads the real setting again', async () => {
    const raw = fake({ 'practice.enabled': { on: false }, 'customers.segments': { enabled: false, maxSegments: 50 } });
    const deps = practiceShownDeps({ resolver: raw });
    expect(await deps.resolver.value('customers.segments' as never, { storeId: 1 })).toEqual({ enabled: false, maxSegments: 50 });
    expect(await practiceOn(fake({}), 1)).toBe(false);
  });
});

describe('PR 1208: a page says when a feature shows as on only because of practice mode', () => {
  it('is true only while practice is on and the stored switch is off', async () => {
    expect(await shownOnlyByPractice(fake({ 'practice.enabled': { on: true }, 'customers.segments': { enabled: false } }), 'customers.segments', 1)).toBe(true);
    expect(await shownOnlyByPractice(fake({ 'practice.enabled': { on: true }, 'customers.segments': { enabled: true } }), 'customers.segments', 1)).toBe(false);
    expect(await shownOnlyByPractice(fake({ 'practice.enabled': { on: false }, 'customers.segments': { enabled: false } }), 'customers.segments', 1)).toBe(false);
  });
});
