// S06 · PR 556 — the campaign this visit came from, as the browser saw it on landing: the first page of the tab with
// utm_source / utm_medium / utm_campaign in its address keeps them in this tab only (sessionStorage — no cookie, nothing
// sent anywhere by itself). The in-transit duplicate notice sends them with its check, so the owner's report can say
// which campaign brings duplicates. Storage that is blocked or full is simply no campaign.

export const CAMPAIGN_KEY = 'extas.campaign';
const FIELDS = [
  ['utm_source', 'source'],
  ['utm_medium', 'medium'],
  ['utm_campaign', 'campaign'],
] as const;
/** The longest value kept per field (the server takes the same). */
export const CAMPAIGN_MAX = { source: 100, medium: 100, campaign: 200 } as const; // hardcode-ok: technical field lengths, the same as the server's input check

export type Campaign = Partial<Record<'source' | 'medium' | 'campaign', string>>;

/** The campaign in an address's query, or null when it carries none. */
export function campaignOf(search: string): Campaign | null {
  const q = new URLSearchParams(search);
  const out: Campaign = {};
  for (const [param, key] of FIELDS) {
    const v = q.get(param)?.trim();
    if (v) out[key] = v.slice(0, CAMPAIGN_MAX[key]);
  }
  return Object.keys(out).length ? out : null;
}

/** On landing: the first address of the tab that carries a campaign is kept (a later page without one keeps it). */
export function keepCampaign(search: string): void {
  const c = campaignOf(search);
  if (!c) return;
  try {
    if (!window.sessionStorage.getItem(CAMPAIGN_KEY)) window.sessionStorage.setItem(CAMPAIGN_KEY, JSON.stringify(c));
  } catch {
    // storage blocked: no campaign
  }
}

/** What the check sends: `{campaign}` when this tab kept one, else nothing. */
export function campaignOfVisit(): { campaign?: Campaign } {
  try {
    const raw = window.sessionStorage.getItem(CAMPAIGN_KEY);
    const kept: unknown = raw ? JSON.parse(raw) : null;
    if (!kept || typeof kept !== 'object') return {};
    const out: Campaign = {};
    for (const [, key] of FIELDS) {
      const v = (kept as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, CAMPAIGN_MAX[key]);
    }
    return Object.keys(out).length ? { campaign: out } : {};
  } catch {
    return {};
  }
}
