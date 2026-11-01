// S13 · PR 256 — a campaign's parts, pure: the input's rules (window, budget kind, coupon offer, no stray field), the
// steps each state allows, the budget lock and the window's place now.
import { describe, expect, it } from 'vitest';
import { budgetLocked, campaignInputSchema, canStep, channelsOf, creativeOf, offerOf, stateOfCampaign, stepsFor, windowNow } from './campaign-model';

const base = { name: 'Eid polo push', channels: ['meta'], offer: { kind: 'none' }, creative: {} };

describe('campaign parts (PR 256)', () => {
  it('takes a plain campaign and refuses an end before its start, a budget without its kind, a coupon offer without a coupon', () => {
    expect(campaignInputSchema.parse(base)).toMatchObject({ name: 'Eid polo push', objective: null, budgetMinor: null, audienceId: null, version: null });
    const bad = (x: object) => {
      const r = campaignInputSchema.safeParse({ ...base, ...x });
      return r.success ? [] : r.error.issues.map((i) => i.path[0]);
    };
    expect(bad({ startsAt: '2026-12-02T00:00:00+06:00', endsAt: '2026-12-01T00:00:00+06:00' })).toEqual(['endsAt']);
    expect(bad({ budgetMinor: 80_000 })).toEqual(['budgetKind']);
    expect(bad({ offer: { kind: 'coupon' } })).toEqual(['couponId']);
    expect(bad({ offer: { kind: 'words', words: { en: '' } } })).toEqual(['offer']);
    expect(bad({ budgetMinor: -1, budgetKind: 'DAILY' })).toEqual(['budgetMinor']);
    expect(bad({ channels: ['myspace'] })).toEqual(['channels']);
    expect(bad({ price: 1 })).toHaveLength(1);
    expect(bad({ name: '  ' })).toEqual(['name']);
  });

  it('allows only the steps that fit each state; archive from anywhere, restore only when archived', () => {
    expect(stepsFor('DRAFT')).toEqual(['schedule', 'start', 'archive']);
    expect(stepsFor('SCHEDULED')).toEqual(['start', 'end', 'archive']);
    expect(stepsFor('RUNNING')).toEqual(['pause', 'end', 'archive']);
    expect(stepsFor('PAUSED')).toEqual(['resume', 'end', 'archive']);
    expect(stepsFor('ENDED')).toEqual(['archive']);
    expect(stepsFor('ARCHIVED')).toEqual(['restore']);
    expect(canStep('start', 'ENDED')).toBe(false);
    expect(stateOfCampaign({ status: 'RUNNING', archivedAt: new Date() })).toBe('ARCHIVED');
  });

  it('locks the budget once the campaign has started', () => {
    expect(['DRAFT', 'SCHEDULED', 'ARCHIVED'].map((s) => budgetLocked(s as never))).toEqual([false, false, false]);
    expect(['RUNNING', 'PAUSED', 'ENDED'].map((s) => budgetLocked(s as never))).toEqual([true, true, true]);
  });

  it('says where the window stands; reads stored JSON back safely; keeps channels once each in order', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    expect(windowNow({ startsAt: null, endsAt: null }, now)).toBe('none');
    expect(windowNow({ startsAt: '2026-11-11T00:00:00Z', endsAt: null }, now)).toBe('soon');
    expect(windowNow({ startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-20T00:00:00Z' }, now)).toBe('on');
    expect(windowNow({ startsAt: null, endsAt: '2026-11-09T00:00:00Z' }, now)).toBe('over');
    expect(offerOf('nonsense')).toEqual({ kind: 'none' });
    expect(creativeOf({ headline: { en: 'Hi', bn: null } }).headline?.en).toBe('Hi');
    expect(channelsOf(['tiktok', 'meta', 'meta', 'bogus'])).toEqual(['meta', 'tiktok']);
  });
});
