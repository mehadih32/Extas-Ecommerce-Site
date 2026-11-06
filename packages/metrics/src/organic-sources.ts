// S11 · PR 238 (Blueprint C4.3 "track referrals from AI assistants separately", C4 build list 5 "organic revenue
// dashboard … broken down by source: Google, Bing, YouTube, AI assistants") — which search engine, video site or AI
// assistant a visit or an order came from. Pure: the shop's proxy uses it to keep an untagged visit from one of these
// sites (apps/web lib/tracking/attribution.ts), the organic report to name where an organic order came from
// (organic.ts). The list itself is the owner's setting (`seo.organic.sources`); nothing here names a site.

export const ORGANIC_KINDS = ['search', 'video', 'ai'] as const;
export type OrganicKind = (typeof ORGANIC_KINDS)[number];

/** One site as the setting lists it: its name, its kind, and the words that name it (a host, or one word of a host). */
export interface OrganicSource {
  name: string;
  kind: OrganicKind;
  match: readonly string[];
}

/**
 * Whether one word (a host such as `www.google.com.bd`, or a campaign source such as `chatgpt.com`) is named by one
 * match word: the same, a sub-domain of it (`m.youtube.com` by `youtube.com`), or — for a word without a dot — one
 * whole part of the host (`google` names `www.google.com.bd`, never `notgoogle.com`).
 */
export function matchesWord(word: string, match: string): boolean {
  const w = word.trim().toLowerCase();
  const m = match.trim().toLowerCase();
  if (!w || !m) return false;
  if (w === m || w.endsWith(`.${m}`)) return true;
  return !m.includes('.') && w.split('.').includes(m);
}

/** The host of an address (`https://www.google.com/` → `www.google.com`), or null. */
export function hostOf(address: string | null | undefined): string | null {
  if (!address) return null;
  try {
    const u = new URL(address);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The first listed site a word names. AI assistants are tried first, then video, then search (Gemini is on google.com). */
export function sourceNamed(word: string | null | undefined, sources: readonly OrganicSource[]): number | null {
  if (!word) return null;
  for (const kind of ['ai', 'video', 'search'] as const) {
    const i = sources.findIndex((s) => s.kind === kind && s.match.some((m) => matchesWord(word, m)));
    if (i >= 0) return i;
  }
  return null;
}

/** Where one order or visit came from: a listed site (its index), another site, or not known (no tag, no address). */
export type OrganicOrigin = { site: number } | 'otherSite' | 'notKnown';

/** The campaign source wins (ChatGPT's links carry `utm_source=chatgpt.com`), then the other site's address. */
export function organicOriginOf(o: { utmSource: string | null; referrer: string | null }, sources: readonly OrganicSource[]): OrganicOrigin {
  const bySource = sourceNamed(o.utmSource, sources);
  if (bySource !== null) return { site: bySource };
  const host = hostOf(o.referrer);
  const byHost = sourceNamed(host, sources);
  if (byHost !== null) return { site: byHost };
  return o.utmSource?.trim() || host ? 'otherSite' : 'notKnown';
}
