// S06 · PR 556 — the campaign of a visit: read from the landing address, kept once per tab, sent with the check.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, campaignOf, campaignOfVisit, keepCampaign } from './campaign';

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe('PR 556 · the campaign of a visit', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads utm_source, utm_medium and utm_campaign, trimmed and cut to size; nothing without them', () => {
    expect(campaignOf('?utm_source=facebook&utm_medium=cpc&utm_campaign=%20oct-polo%20&x=1')).toEqual({ source: 'facebook', medium: 'cpc', campaign: 'oct-polo' });
    expect(campaignOf('?utm_campaign=' + 'a'.repeat(300))!.campaign).toHaveLength(200);
    expect(campaignOf('?x=1')).toBeNull();
    expect(campaignOf('')).toBeNull();
  });

  it('keeps the first campaign of the tab and sends it; blocked storage is no campaign', () => {
    const s = fakeStorage();
    vi.stubGlobal('window', { sessionStorage: s });
    expect(campaignOfVisit()).toEqual({});
    keepCampaign('?utm_source=facebook&utm_campaign=oct-polo');
    keepCampaign('?utm_source=google&utm_campaign=later');
    expect(JSON.parse(s.m.get(CAMPAIGN_KEY)!)).toEqual({ source: 'facebook', campaign: 'oct-polo' });
    expect(campaignOfVisit()).toEqual({ campaign: { source: 'facebook', campaign: 'oct-polo' } });
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(() => keepCampaign('?utm_source=x')).not.toThrow();
    expect(campaignOfVisit()).toEqual({});
  });
});
