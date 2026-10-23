// PR 63 — Delivery · Exchange · Returns under the buttons (Blueprint D3.5 / D3.6, demo 30-product.js pdp_rulesRow): three
// cells, each with its short line and a value ("Free", "72 hours", "Size swap only") that opens the full text across
// the whole box, one at a time. The words are the owner's live Smart Rules for the product page (PR 208–216); exchange
// and returns fall back to his policy texts. A cell with nothing true to say is left out, never filled with ours. Pure.
import type { PdpRulesSettings } from '@extas/settings';

export type RuleCellId = PdpRulesSettings['cells'][number]['id'];

/** A live rule's text for the product page (lib/rules-public placeTexts). */
export interface RuleTextLike {
  key: string;
  kind: string;
  texts: Partial<Record<string, string>>;
}

export interface RuleCell {
  id: RuleCellId;
  short: string;
  /** The full text, one sentence per line. */
  full: string[];
  value: string;
  /** The value in the brand colour (this product has free delivery). */
  hot: boolean;
}

export interface RuleFacts {
  freeDelivery: boolean;
  exchange: { on: boolean; summary: string; value: string };
  returns: { summary: string; afterDelivery: boolean };
}

export interface RuleWords {
  free: string;
  more: string;
  swapOnly: string;
}

const lines = (s: string | undefined) =>
  (s ?? '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

function fromRule(id: RuleCellId, r: RuleTextLike | undefined, fallbackValue: string, hot: boolean): RuleCell | null {
  const short = r?.texts.short?.trim();
  if (!r || !short) return null;
  const full = lines(r.texts.full);
  return { id, short, full: full.length ? full : [short], value: r.texts.badge?.trim() || fallbackValue, hot };
}

/** The cells to draw, in the owner's order. */
export function ruleCells(set: PdpRulesSettings, texts: readonly RuleTextLike[], facts: RuleFacts, words: RuleWords): RuleCell[] {
  if (!set.on) return [];
  const of = (kind: string, pick?: (r: RuleTextLike) => boolean) => texts.find((r) => r.kind === kind && (!pick || pick(r)));
  const build: Record<RuleCellId, () => RuleCell | null> = {
    delivery: () => fromRule('delivery', of('delivery'), facts.freeDelivery ? words.free : words.more, facts.freeDelivery),
    exchange: () =>
      fromRule('exchange', of('exchange'), facts.exchange.value, false) ??
      (facts.exchange.on && facts.exchange.summary.trim() ? { id: 'exchange', short: facts.exchange.summary.trim(), full: lines(facts.exchange.summary), value: facts.exchange.value, hot: false } : null),
    returns: () =>
      fromRule('returns', of('policy', (r) => /return/i.test(r.key)), facts.returns.afterDelivery ? words.more : words.swapOnly, false) ??
      (facts.returns.summary.trim()
        ? { id: 'returns', short: facts.returns.summary.trim(), full: lines(facts.returns.summary), value: facts.returns.afterDelivery ? words.more : words.swapOnly, hot: false }
        : null),
  };
  return set.cells.filter((c) => c.on).flatMap((c) => build[c.id]() ?? []);
}
