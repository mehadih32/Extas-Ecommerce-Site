// S13 · PR 256 (Blueprint C6.2, demo 93-admin-ads.js "New campaign · draft") — a campaign's parts, pure: its audience,
// offer, creative, window and budget, the steps between its states, and when its budget is locked.
//
// - A campaign is our own record of one push: where it runs (channels), what it aims for (delivered purchases first,
//   Blueprint C6.2 point 1), who it is for (an Audience, PR 262 builds them), the offer (a coupon or the owner's words),
//   the creative (headline and main text), the window (start, end) and the planned budget (per day or in total).
// - Nothing here sends anything to an ad platform or moves money: the budget is a plan. Once a campaign has started its
//   budget is locked here; a change to a live budget goes through the change request and the owner's approval (PR 268).
// - Every word is the owner's; every list (channels, objectives) is a code key whose label is in the messages files.
import { z } from 'zod';

export const CAMPAIGN_CHANNELS = ['meta', 'google', 'youtube', 'tiktok', 'sms', 'whatsapp', 'email', 'organic'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];
/** What the campaign aims for; `delivered` first: for a COD shop the parcel accepted is the sale (C6.2 point 1). */
export const CAMPAIGN_OBJECTIVES = ['delivered', 'sales', 'traffic', 'awareness', 'retarget'] as const;
export const OFFER_KINDS = ['none', 'coupon', 'words'] as const;
export const BUDGET_KINDS = ['DAILY', 'TOTAL'] as const;
export const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'ENDED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const CAMPAIGN_ACTIONS = ['schedule', 'start', 'pause', 'resume', 'end', 'archive', 'restore'] as const;
export type CampaignAction = (typeof CAMPAIGN_ACTIONS)[number];

/** The largest budget the form takes, in minor units (a typing guard, not a business limit: Int column). */
export const BUDGET_MINOR_MAX = 2_000_000_000; // hardcode-ok: the column's range, not a business number

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const pair = (max: number) => z.object({ en: optText(max), bn: optText(max) }).strict();
const uuidOrNull = z
  .string()
  .uuid()
  .nullish()
  .transform((v) => v ?? null);
const instant = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .transform((v) => v ?? null);

export const offerSchema = z.object({ kind: z.enum(OFFER_KINDS), words: pair(160).optional() }).strict();
export const creativeSchema = z.object({ headline: pair(120).optional(), text: pair(600).optional() }).strict();
export type CampaignOffer = z.output<typeof offerSchema>;
export type CampaignCreative = z.output<typeof creativeSchema>;

export const campaignInputSchema = z
  .object({
    name: text(120).min(1),
    objective: z
      .enum(CAMPAIGN_OBJECTIVES)
      .nullish()
      .transform((v) => v ?? null),
    channels: z.array(z.enum(CAMPAIGN_CHANNELS)).max(CAMPAIGN_CHANNELS.length),
    audienceId: uuidOrNull,
    offer: offerSchema,
    couponId: uuidOrNull,
    creative: creativeSchema,
    startsAt: instant,
    endsAt: instant,
    budgetMinor: z
      .number()
      .int()
      .min(0)
      .max(BUDGET_MINOR_MAX)
      .nullish()
      .transform((v) => v ?? null),
    budgetKind: z
      .enum(BUDGET_KINDS)
      .nullish()
      .transform((v) => v ?? null),
    /** The campaign's version as it was read (its updatedAt); null for a new one. */
    version: z
      .string()
      .nullish()
      .transform((v) => v ?? null),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.startsAt && d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'end before start' });
    if (d.budgetMinor != null && !d.budgetKind) ctx.addIssue({ code: 'custom', path: ['budgetKind'], message: 'budget needs its kind' });
    if (d.offer.kind === 'coupon' && !d.couponId) ctx.addIssue({ code: 'custom', path: ['couponId'], message: 'coupon offer needs a coupon' });
    if (d.offer.kind === 'words' && !d.offer.words?.en) ctx.addIssue({ code: 'custom', path: ['offer'], message: 'offer words needed' });
  });
export type CampaignInput = z.output<typeof campaignInputSchema>;

/** The channels once each, in the list's own order. */
export const channelsOf = (xs: readonly string[]): CampaignChannel[] => CAMPAIGN_CHANNELS.filter((c) => xs.includes(c));

/** A stored offer or creative read back (bad JSON = empty). */
export const offerOf = (v: unknown): CampaignOffer => {
  const r = offerSchema.safeParse(v);
  return r.success ? r.data : { kind: 'none' };
};
export const creativeOf = (v: unknown): CampaignCreative => {
  const r = creativeSchema.safeParse(v);
  return r.success ? r.data : {};
};

export type CampaignState = CampaignStatus | 'ARCHIVED';
export const stateOfCampaign = (c: { status: string; archivedAt: Date | null }): CampaignState => (c.archivedAt ? 'ARCHIVED' : (c.status as CampaignStatus));

const NEXT: Record<CampaignAction, (s: CampaignState) => boolean> = {
  schedule: (s) => s === 'DRAFT',
  start: (s) => s === 'DRAFT' || s === 'SCHEDULED',
  pause: (s) => s === 'RUNNING',
  resume: (s) => s === 'PAUSED',
  end: (s) => s === 'SCHEDULED' || s === 'RUNNING' || s === 'PAUSED',
  archive: (s) => s !== 'ARCHIVED',
  restore: (s) => s === 'ARCHIVED',
};
export const canStep = (a: CampaignAction, s: CampaignState) => NEXT[a](s);
/** The steps the campaign's state allows now, in the list's order. */
export const stepsFor = (s: CampaignState): CampaignAction[] => CAMPAIGN_ACTIONS.filter((a) => NEXT[a](s));

/** The status a step leads to (archive and restore keep the status and only set or clear archivedAt). */
export const STATUS_AFTER: Partial<Record<CampaignAction, CampaignStatus>> = { schedule: 'SCHEDULED', start: 'RUNNING', pause: 'PAUSED', resume: 'RUNNING', end: 'ENDED' };

/** Once a campaign has started, its budget is locked here (a live budget changes only through PR 268's approval). */
export const budgetLocked = (s: CampaignState) => s === 'RUNNING' || s === 'PAUSED' || s === 'ENDED';

/** Where the campaign's window stands now: not set, still to come, on, or over. */
export function windowNow(w: { startsAt: Date | string | null; endsAt: Date | string | null }, now: Date): 'none' | 'soon' | 'on' | 'over' {
  const s = w.startsAt ? new Date(w.startsAt).getTime() : null;
  const e = w.endsAt ? new Date(w.endsAt).getTime() : null;
  if (s == null && e == null) return 'none';
  if (e != null && e <= now.getTime()) return 'over';
  if (s != null && s > now.getTime()) return 'soon';
  return 'on';
}
