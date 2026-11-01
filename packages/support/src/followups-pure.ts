// S22 · PR 433 — the rules of a follow-up, without a database (the sweep in followups.ts and the screens use them).
//
// A chat is quiet when the shop answered last and it is not solved; a follow-up is due `afterHours` after that answer,
// only while the channel's reply window stays open at least `windowMarginMinutes` more. Which follow-up: the first of
// the owner's rules that holds — the bag left in the chat, products sent and none ordered, the chat's order cancelled
// lately (win-back). The words are the store's own, in Bengali when the customer wrote Bengali letters, with the
// owner's coupon line only when a live coupon was named.
import { FOLLOW_UP_RULES, type FollowUpRule, type SupportFollowUpSettings, type SupportFollowUpWordsSettings } from '@extas/settings';
import { fillDraft, isBengaliScript } from './drafts-pure';

export { FOLLOW_UP_BOUNDS, FOLLOW_UP_RULES, FOLLOW_UP_TEXTS, type FollowUpRule } from '@extas/settings';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 86_400_000;

/** What a follow-up ends as (null while it waits for a person). */
export const FOLLOW_UP_OUTCOMES = ['SENT', 'SKIPPED', 'CLOSED', 'ORDERED'] as const;
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

/** The chat as the timing rule reads it. */
export interface FollowUpChat {
  status: string;
  lastDirection: string | null;
  lastMessageAt: Date | null;
  windowExpiresAt: Date | null;
}

/** What the chat holds that did not become an order. */
export interface FollowUpFacts {
  /** Pieces in the chat's bag. */
  bagLines: number;
  /** Products sent in the chat that no order came from. */
  openShares: number;
  /** When the chat's order was cancelled (null: none, or not cancelled). */
  cancelledAt: Date | null;
}

type Timing = Pick<SupportFollowUpSettings, 'afterHours' | 'windowMarginMinutes'>;

/** When the follow-up is due (the shop's last answer plus `afterHours`), or null when the chat is not quiet. */
export function followUpDueAt(c: FollowUpChat, cfg: Timing): Date | null {
  if (c.status === 'SOLVED' || c.lastDirection !== 'OUT' || !c.lastMessageAt) return null;
  return new Date(c.lastMessageAt.getTime() + cfg.afterHours * HOUR);
}

/** Whether the chat may get a follow-up now: quiet long enough, and its reply window open long enough. */
export function followUpOpen(c: FollowUpChat, cfg: Timing, now: Date): boolean {
  const due = followUpDueAt(c, cfg);
  if (!due || due.getTime() > now.getTime()) return false;
  return !c.windowExpiresAt || c.windowExpiresAt.getTime() - now.getTime() >= Math.max(1, cfg.windowMarginMinutes) * MINUTE;
}

/** Which follow-up the chat gets: the first of the owner's rules that holds, or null. */
export function followUpRuleOf(f: FollowUpFacts, cfg: Pick<SupportFollowUpSettings, 'rules' | 'cancelledDays'>, now: Date): FollowUpRule | null {
  for (const r of FOLLOW_UP_RULES) {
    if (!cfg.rules.includes(r)) continue;
    if (r === 'bag' && f.bagLines > 0) return r;
    if (r === 'products' && f.openShares > 0) return r;
    if (r === 'cancelled' && f.cancelledAt && now.getTime() - f.cancelledAt.getTime() <= cfg.cancelledDays * DAY) return r;
  }
  return null;
}

/** The keys one person is counted under: the customer when the chat has one, and the chat's first contact. */
export function personKeysOf(customerId: string | null, contact: { id: string; mergedIntoId: string | null }): string[] {
  const keys = [`p:${contact.mergedIntoId ?? contact.id}`];
  return customerId ? [`c:${customerId}`, ...keys] : keys;
}

/** The language of the follow-up: Bengali for Bengali letters, else the owner's choice for Latin letters. */
export const followUpLang = (lastCustomerText: string | null, banglish: 'bn' | 'en'): 'bn' | 'en' => (lastCustomerText && isBengaliScript(lastCustomerText) ? 'bn' : banglish);

/** The follow-up's words: the rule's text, then the coupon line when the owner's live coupon is named. */
export function followUpBody(words: SupportFollowUpWordsSettings, rule: FollowUpRule, lang: 'bn' | 'en', v: { hello: string; name: string | null; product: string | null; code: string | null }): string {
  const main = fillDraft(words[rule][lang], { hello: v.hello, name: v.name, product: v.product });
  return v.code ? `${main} ${fillDraft(words.offer[lang], { code: v.code })}` : main;
}
