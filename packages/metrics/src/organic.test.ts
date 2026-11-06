// S11 · PR 238 — the organic source matcher and the organic split (pure; the SQL is the same Sales rule as kpi()).
import { describe, expect, it } from 'vitest';
import type { ChannelRules } from './channels';
import { organicOf } from './organic';
import { hostOf, matchesWord, organicOriginOf, sourceNamed, type OrganicSource } from './organic-sources';

const sources: OrganicSource[] = [
  { name: 'Google', kind: 'search', match: ['google'] },
  { name: 'Bing', kind: 'search', match: ['bing.com'] },
  { name: 'YouTube', kind: 'video', match: ['youtube.com', 'youtu.be'] },
  { name: 'ChatGPT', kind: 'ai', match: ['chatgpt.com', 'chat.openai.com'] },
  { name: 'Gemini', kind: 'ai', match: ['gemini.google.com'] },
];
const rules: ChannelRules = { paidMediums: ['cpc', 'paid'], platforms: [{ platform: 'GOOGLE', sources: ['google'] }] };

describe('matchesWord', () => {
  it('takes the same host, a sub-domain, or one whole part of a host for a word without a dot', () => {
    expect(matchesWord('www.google.com.bd', 'google')).toBe(true);
    expect(matchesWord('m.youtube.com', 'youtube.com')).toBe(true);
    expect(matchesWord('chatgpt.com', 'chatgpt.com')).toBe(true);
    expect(matchesWord('notgoogle.com', 'google')).toBe(false);
    expect(matchesWord('evilyoutube.com', 'youtube.com')).toBe(false);
    expect(matchesWord('', 'google')).toBe(false);
  });
  it('reads a host only from a web address', () => {
    expect(hostOf('https://www.Bing.com/')).toBe('www.bing.com');
    expect(hostOf('android-app://com.google.android.gm')).toBeNull();
    expect(hostOf('not a url')).toBeNull();
  });
  it('tries AI assistants before search engines, so Gemini on google.com is Gemini', () => {
    expect(sourceNamed('gemini.google.com', sources)).toBe(4);
    expect(sourceNamed('www.google.com', sources)).toBe(0);
    expect(sourceNamed('example.com', sources)).toBeNull();
  });
});

describe('organicOriginOf', () => {
  it('reads the campaign source first, then the address, else another site or not known', () => {
    expect(organicOriginOf({ utmSource: 'chatgpt.com', referrer: null }, sources)).toEqual({ site: 3 });
    expect(organicOriginOf({ utmSource: null, referrer: 'https://www.google.com' }, sources)).toEqual({ site: 0 });
    expect(organicOriginOf({ utmSource: 'newsletter', referrer: null }, sources)).toBe('otherSite');
    expect(organicOriginOf({ utmSource: null, referrer: 'https://blog.example' }, sources)).toBe('otherSite');
    expect(organicOriginOf({ utmSource: null, referrer: null }, sources)).toBe('notKnown');
  });
});

describe('organicOf', () => {
  const o = (x: Partial<Parameters<typeof organicOf>[0][number]>) => ({ source: 'WEBSITE', adPlatform: null, campaignPlatform: null, utmSource: null, utmMedium: null, referrer: null, total: 1000, ...x });
  it('counts every Sales order, keeps paid and non-web orders out of organic, and names each organic one', () => {
    const r = organicOf(
      [
        o({ referrer: 'https://www.google.com', total: 3000 }),
        o({ utmSource: 'chatgpt.com', total: 2000 }),
        o({ referrer: 'https://www.youtube.com' }),
        o({}),
        o({ utmSource: 'google', utmMedium: 'cpc', total: 5000 }),
        o({ adPlatform: 'META', total: 4000 }),
        o({ source: 'MESSENGER', referrer: 'https://www.google.com', total: 5000 }),
      ],
      sources,
      rules,
      { from: '2026-10-01', to: '2026-10-28' },
    );
    expect(r.all).toEqual({ orders: 7, salesMinor: 21000 });
    expect(r.organic).toEqual({ orders: 4, salesMinor: 7000 });
    expect(r.sharePct).toBe(33.3);
    expect(r.kinds).toEqual({ search: { orders: 1, salesMinor: 3000 }, video: { orders: 1, salesMinor: 1000 }, ai: { orders: 1, salesMinor: 2000 } });
    expect(r.rows.map((x) => [x.key, x.name, x.salesMinor])).toEqual([
      ['site:0', 'Google', 3000],
      ['site:3', 'ChatGPT', 2000],
      ['site:2', 'YouTube', 1000],
      ['notKnown', null, 1000],
    ]);
  });
  it('has no share without Sales', () => {
    expect(organicOf([], sources, rules, { from: '2026-10-01', to: '2026-10-01' }).sharePct).toBeNull();
  });
});
