// S12 · PR 592 (register "Blog as a complete, standard section of the shop, with our own ad placements"; Blueprint
// C11.5 "House ads and popup rules") — the journal's house ads without a database: what an ad and a place are, which
// ads a page gets, the popup's rules and the click cookie. Pure, so the shop pages, the popup, the admin and the tests
// share one rule.
//
// - An ad is ours only: a banner (a picture and a shop address), a product, a combo or a category. No outside network.
// - A place is where it shows: the journal's top, between its cards (after card N), a topic page, inside an article
//   (after paragraph N, never before the first), beside the article on a desktop, at its end, a slim bar, or a popup.
//   It is for every page ("all"), one article, or one topic (and its sub-topics).
// - A page gets the most relevant running ad per place (one article > its topic > an ad of a product in the article >
//   all), then by weight; at most `maxPerPage` on an article (the bar and the popup count as one: the popup replaces the
//   bar for the visit), `inlineMax` inside the words, never the same ad twice. Empty places simply collapse.
// - Dates are whole shop days (Asia/Dhaka unless the store says otherwise): from the start of the first day to the end
//   of the last.
// - A popup opens on its trigger (read this far, this long on the page, or leaving) at most `times` in `days`; with the
//   search guard a phone visitor from a search engine never gets it on the first screen.
import { z } from 'zod';
import { dayStart, hostOf, matchesWord, nextDay, ymdIn } from '@extas/metrics/pure';
import type { HouseAdsSettings } from '@extas/settings';
import { safeHref } from './blocks';

export const HOUSE_AD_KINDS = ['banner', 'product', 'combo', 'category'] as const;
export type HouseAdKind = (typeof HOUSE_AD_KINDS)[number];

/** The places, in the order an article page fills them when it may not take them all. */
export const HOUSE_AD_SLOTS = ['listTop', 'topic', 'listBetween', 'inline', 'end', 'popup', 'bar', 'sidebar'] as const;
export type HouseAdSlot = (typeof HOUSE_AD_SLOTS)[number];
/** The places of an article page (the rest are the journal's list and topic pages). */
export const ARTICLE_SLOTS: readonly HouseAdSlot[] = ['inline', 'end', 'popup', 'bar', 'sidebar'];
/** The places of the list pages: the journal's own and a topic's. */
export const LIST_SLOTS: readonly HouseAdSlot[] = ['listTop', 'listBetween', 'topic'];
/** Places that take a number ("after paragraph N" inside an article, "after card N" between cards). */
export const NUMBERED_SLOTS: readonly HouseAdSlot[] = ['inline', 'listBetween'];

export const POPUP_TRIGGERS = ['scroll', 'time', 'leave'] as const;
export type PopupTrigger = (typeof POPUP_TRIGGERS)[number];
export const PLACE_SCOPES = ['all', 'category', 'post'] as const;
export type PlaceScope = (typeof PLACE_SCOPES)[number];

export const AD_NAME_MAX = 80; // hardcode-ok: field lengths, not business numbers
export const AD_HEADLINE_MAX = 90; // hardcode-ok
export const AD_TEXT_MAX = 220; // hardcode-ok
export const AD_CTA_MAX = 30; // hardcode-ok
export const AD_TARGET_MAX = 300; // hardcode-ok
const WEIGHT_MAX = 100; // hardcode-ok: a share between ads, not a business number
const AFTER_MAX = 40; // hardcode-ok: a paragraph or card position
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const words = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const adInputSchema = z
  .object({
    name: z.string().trim().min(1).max(AD_NAME_MAX),
    kind: z.enum(HOUSE_AD_KINDS),
    target: z.string().trim().min(1).max(AD_TARGET_MAX),
    creativeAssetId: z.string().regex(UUID).nullable().optional().transform((v) => v ?? null),
    weight: z.coerce.number().int().min(1).max(WEIGHT_MAX),
    startsOn: z.string().regex(YMD).nullable().optional().transform((v) => v ?? null),
    endsOn: z.string().regex(YMD).nullable().optional().transform((v) => v ?? null),
    headlineEn: z.string().trim().min(1).max(AD_HEADLINE_MAX),
    headlineBn: words(AD_HEADLINE_MAX),
    textEn: words(AD_TEXT_MAX),
    textBn: words(AD_TEXT_MAX),
    ctaEn: words(AD_CTA_MAX),
    ctaBn: words(AD_CTA_MAX),
  })
  .strict()
  .superRefine((v, ctx) => {
    // a banner goes to one of the shop's own pages; the others name the product, combo or category by id
    const ok = v.kind === 'banner' ? !!safeHref(v.target) && v.target.startsWith('/') : UUID.test(v.target);
    if (!ok) ctx.addIssue({ code: 'custom', path: ['target'], message: 'target' });
    if (v.kind === 'banner' && !v.creativeAssetId) ctx.addIssue({ code: 'custom', path: ['creativeAssetId'], message: 'picture' });
    if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'order' });
  });
export type AdInput = z.output<typeof adInputSchema>;

export const placeInputSchema = z
  .object({
    slot: z.enum(HOUSE_AD_SLOTS),
    scope: z.enum(PLACE_SCOPES),
    blogCategoryId: z.string().regex(UUID).nullable().optional().transform((v) => v ?? null),
    postId: z.string().regex(UUID).nullable().optional().transform((v) => v ?? null),
    after: z.coerce.number().int().min(1).max(AFTER_MAX).nullable().optional().transform((v) => v ?? null),
    trigger: z.enum(POPUP_TRIGGERS).nullable().optional().transform((v) => v ?? null),
    pct: z.coerce.number().int().min(10).max(95).nullable().optional().transform((v) => v ?? null),
    seconds: z.coerce.number().int().min(0).max(600).nullable().optional().transform((v) => v ?? null),
    capTimes: z.coerce.number().int().min(1).max(20).nullable().optional().transform((v) => v ?? null),
    capDays: z.coerce.number().int().min(1).max(90).nullable().optional().transform((v) => v ?? null),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.scope === 'category' && !v.blogCategoryId) ctx.addIssue({ code: 'custom', path: ['blogCategoryId'], message: 'category' });
    if (v.scope === 'post' && !v.postId) ctx.addIssue({ code: 'custom', path: ['postId'], message: 'post' });
    if (v.scope === 'post' && LIST_SLOTS.includes(v.slot)) ctx.addIssue({ code: 'custom', path: ['scope'], message: 'list' });
    if (NUMBERED_SLOTS.includes(v.slot) && !v.after) ctx.addIssue({ code: 'custom', path: ['after'], message: 'after' });
  });
export type PlaceInput = z.output<typeof placeInputSchema>;

/** A popup's trigger as stored (HouseAdPlacement.trigger). */
export interface PopupRule {
  kind: PopupTrigger;
  pct: number;
  seconds: number;
}
/** A popup's cap as stored (HouseAdPlacement.frequencyCap). */
export interface PopupCap {
  times: number;
  days: number;
}

/** The trigger and cap a place stores: a popup's own, else the settings' defaults for a new one; other places none. */
export function popupOf(input: Pick<PlaceInput, 'slot' | 'trigger' | 'pct' | 'seconds' | 'capTimes' | 'capDays'>, s: HouseAdsSettings): { trigger: PopupRule; cap: PopupCap } | null {
  if (input.slot !== 'popup') return null;
  return {
    trigger: { kind: input.trigger ?? (s.popupSeconds > 0 ? 'time' : 'scroll'), pct: input.pct ?? s.popupScrollPct, seconds: input.seconds ?? s.popupSeconds },
    cap: { times: input.capTimes ?? s.capTimes, days: input.capDays ?? s.capDays },
  };
}

/** A stored trigger or cap read back (anything unreadable: the settings' defaults). */
export function readPopup(trigger: unknown, cap: unknown, s: HouseAdsSettings): { trigger: PopupRule; cap: PopupCap } {
  const t = (trigger && typeof trigger === 'object' ? trigger : {}) as Record<string, unknown>;
  const c = (cap && typeof cap === 'object' ? cap : {}) as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  return {
    trigger: { kind: (POPUP_TRIGGERS as readonly unknown[]).includes(t.kind) ? (t.kind as PopupTrigger) : 'scroll', pct: int(t.pct, 10, 95, s.popupScrollPct), seconds: int(t.seconds, 0, 600, s.popupSeconds) },
    cap: { times: int(c.times, 1, 20, s.capTimes), days: int(c.days, 1, 90, s.capDays) },
  };
}

/** Whole shop days → the stored times: from the start of the first day to the start of the day after the last. */
export function datesOf(startsOn: string | null, endsOn: string | null, timeZone: string): { startsAt: Date | null; endsAt: Date | null } {
  return { startsAt: startsOn ? dayStart(startsOn, timeZone) : null, endsAt: endsOn ? dayStart(nextDay(endsOn), timeZone) : null };
}

/** The stored times → the shop days the admin shows (the last day is the one before `endsAt`). */
export function daysOf(startsAt: Date | null, endsAt: Date | null, timeZone: string): { startsOn: string | null; endsOn: string | null } {
  return { startsOn: startsAt ? ymdIn(startsAt, timeZone) : null, endsOn: endsAt ? ymdIn(new Date(endsAt.getTime() - 1), timeZone) : null };
}

export interface AdTiming {
  enabled: boolean;
  archivedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** Running now: switched on, not set aside, and inside its dates. */
export const isRunning = (a: AdTiming, now: Date) => a.enabled && !a.archivedAt && (!a.startsAt || a.startsAt <= now) && (!a.endsAt || now < a.endsAt);

/** Where an ad stands for the admin's list. */
export function adState(a: AdTiming, now: Date): 'running' | 'off' | 'waiting' | 'ended' | 'aside' {
  if (a.archivedAt) return 'aside';
  if (!a.enabled) return 'off';
  if (a.startsAt && now < a.startsAt) return 'waiting';
  if (a.endsAt && now >= a.endsAt) return 'ended';
  return 'running';
}

/** One running ad in one place, as a page sees it before picking. */
export interface Candidate {
  placeId: string;
  adId: string;
  slot: HouseAdSlot;
  kind: HouseAdKind;
  target: string | null;
  weight: number;
  postId: string | null;
  blogCategoryId: string | null;
  after: number | null;
}

/** What a page is about: the article (its id, topic and the topic's parent, its products) or a list (a topic or none). */
export interface PageFacts {
  postId: string | null;
  categoryIds: readonly string[];
  productIds: readonly string[];
}

/** How well a place fits the page: -1 not for this page; 3 this article; 2 its topic; 1 a product it shows; 0 all. */
export function relevance(c: Candidate, page: PageFacts): number {
  if (c.postId) return c.postId === page.postId ? 3 : -1;
  if (c.blogCategoryId) return page.categoryIds.includes(c.blogCategoryId) ? 2 : -1;
  if (c.kind === 'product' && c.target && page.productIds.includes(c.target)) return 1;
  return 0;
}

/** One pick by weight among the equally relevant (rnd in [0, 1)). */
function byWeight<T extends { weight: number }>(list: readonly T[], rnd: () => number): T | null {
  const total = list.reduce((n, x) => n + Math.max(1, x.weight), 0);
  if (!total) return null;
  let at = rnd() * total;
  for (const x of list) {
    at -= Math.max(1, x.weight);
    if (at < 0) return x;
  }
  return list[list.length - 1] ?? null;
}

/**
 * The ads one page shows, place by place. `slots` are the page's places (an article's or a list's); the article pages
 * keep `maxPerPage` (the bar and the popup as one) and `inlineMax`; no ad shows twice on a page. Inside the words each
 * paragraph position takes one ad; between cards each card position one.
 */
export function pickForPage(all: readonly Candidate[], page: PageFacts, slots: readonly HouseAdSlot[], s: Pick<HouseAdsSettings, 'maxPerPage' | 'inlineMax'>, rnd: () => number = Math.random): Candidate[] {
  const out: Candidate[] = [];
  const usedAds = new Set<string>();
  const article = slots.some((x) => ARTICLE_SLOTS.includes(x));
  let counted = 0;
  let barOrPopup = false;
  for (const slot of HOUSE_AD_SLOTS) {
    if (!slots.includes(slot)) continue;
    const here = all.filter((c) => c.slot === slot && relevance(c, page) >= 0);
    // numbered places: one ad per position, positions in order; the rest: one ad
    const positions = NUMBERED_SLOTS.includes(slot) ? [...new Set(here.map((c) => c.after ?? 1))].sort((a, b) => a - b) : [null];
    let inSlot = 0;
    for (const pos of positions) {
      if (slot === 'inline' && inSlot >= s.inlineMax) break;
      const pairsBar = (slot === 'bar' || slot === 'popup') && barOrPopup;
      if (article && !pairsBar && counted >= s.maxPerPage) break;
      const open = here.filter((c) => (pos === null || (c.after ?? 1) === pos) && !usedAds.has(c.adId));
      if (!open.length) continue;
      const best = Math.max(...open.map((c) => relevance(c, page)));
      const chosen = byWeight(
        open.filter((c) => relevance(c, page) === best),
        rnd,
      );
      if (!chosen) continue;
      out.push(chosen);
      usedAds.add(chosen.adId);
      inSlot += 1;
      if (!pairsBar) counted += 1;
      if (slot === 'bar' || slot === 'popup') barOrPopup = true;
    }
  }
  return out;
}

/** The browser's last house ad click: `<place id>.<time>` (the shop's own cookie; nothing about the person). */
export const AD_CLICK_COOKIE = 'ex_hac';

export function parseClick(raw: string | null | undefined): { placeId: string; at: number } | null {
  const m = /^([0-9a-f-]{36})\.(\d{10,15})$/i.exec(raw ?? '');
  if (!m || !UUID.test(m[1]!)) return null;
  return { placeId: m[1]!.toLowerCase(), at: Number(m[2]) };
}

export const serializeClick = (placeId: string, at: number) => `${placeId}.${Math.floor(at)}`;

/** The click an order credits: the last one, made before the order and at most `creditDays` before it. */
export function creditedClick(click: { placeId: string; at: number } | null, placedAt: Date, creditDays: number): { placeId: string; at: number } | null {
  if (!click) return null;
  const t = placedAt.getTime();
  return click.at <= t && t - click.at <= creditDays * 86_400_000 ? click : null;
}

/** A popup's shows in this browser (times, newest last), kept to the cap's window. */
export function capWindow(shows: readonly number[], now: number, days: number): number[] {
  const from = now - days * 86_400_000;
  return shows.filter((x) => Number.isFinite(x) && x > from && x <= now);
}

export interface PopupMoment {
  /** How much of the page is read, per cent. */
  readPct: number;
  /** Seconds on the page. */
  seconds: number;
  /** The visitor is leaving (the pointer left the window at the top, or he went back). */
  leaving: boolean;
  /** Scrolled past the first screen. */
  pastFirstScreen: boolean;
  phone: boolean;
  /** Came from a search engine (the organic list's sites). */
  fromSearch: boolean;
  /** Shows in the cap's window. */
  shownInWindow: number;
  /** Closed once on this visit already. */
  closedThisVisit: boolean;
}

/** May the popup open now? Its trigger met, under its cap, not closed this visit, and the search guard kept. */
export function popupMayOpen(rule: PopupRule, cap: PopupCap, m: PopupMoment, searchGuard: boolean): boolean {
  if (m.closedThisVisit || m.shownInWindow >= cap.times) return false;
  if (searchGuard && m.phone && m.fromSearch && !m.pastFirstScreen) return false;
  if (rule.kind === 'scroll') return m.readPct >= rule.pct;
  if (rule.kind === 'time') return rule.seconds > 0 && m.seconds >= rule.seconds;
  return m.leaving;
}

/** Did the visit come from a search engine? `words` are the match words of the SEO organic list's search sites. */
export function fromSearchSite(referrer: string, words: readonly string[]): boolean {
  const host = hostOf(referrer);
  return !!host && words.some((w) => matchesWord(host, w));
}
