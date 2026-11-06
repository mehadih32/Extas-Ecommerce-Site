// S13 · PR 281 — what a festive Smart Rule (PR 214: a last order time per delivery band, `cutoff` action) says on the
// shop, with no database. Before a band's time the rule's short words ("Order by … for delivery before the festival");
// once that time passed its "after" words ("Orders placed now arrive after the festival"), or nothing when the owner
// wrote none. Without a band (the home and product pages, where the address is not known yet) the rule is open while
// any band's time is still ahead and closed once every one passed. With a band (checkout, the thank-you page) only that
// band's time counts ('*' covers every band); a closed band's words stand in for the usual hours promise (SIM-F-019:
// never the usual promise past a cut-off). Every date and word is the owner's, in the rule; nothing here invents one.
// Follow-up (lane B, builder 41's finding): an open line names the time of every band it speaks for — with a band, that
// band's own time; without one, every band's time — so a customer never reads another area's later time as his own
// (the template's short words name only the Dhaka-city time). The short words when they do; else the full words (the
// template's lists each area); else no line. Words only: no charge, rule or Cash on Delivery change.
import { isLive, valueOf, type Rule, type TextSlot } from './model';
import { langOf, pick, ruleText, tokensIn, type TextContext, type WindowedParams } from './text';

/** One band's last order time, as the rule holds it (an ISO date-time). */
export interface FestiveCut {
  band: string;
  at: string;
}

export type FestiveState = { state: 'none' } | { state: 'open'; next: string } | { state: 'closed' };

/** A festive rule's line for one place: its words, and whether the band (or every band) is past its time. */
export interface FestiveLine {
  key: string;
  /** The rule's own name in the asked language (English when the Bengali is not written). */
  name: string;
  text: string;
  state: 'open' | 'closed';
}

/** The rule's cut-offs: each `cutoff` action's band and its date-time value; a band with no time is left out. */
export function festiveCuts(rule: Pick<Rule, 'actions' | 'params'>): FestiveCut[] {
  const out: FestiveCut[] = [];
  for (const a of rule.actions) {
    if (a.type !== 'cutoff') continue;
    for (const [band, param] of Object.entries(a.byBand)) {
      const at = valueOf<string>(rule, param);
      if (at && !Number.isNaN(new Date(at).getTime())) out.push({ band, at });
    }
  }
  return out;
}

/** The params of the timed cut-offs a line speaks for: the band's own (or '*'), or every band's when it is not known. */
function cutParams(rule: Pick<Rule, 'actions' | 'params'>, band: string | null): Set<string> {
  const out = new Set<string>();
  for (const a of rule.actions) {
    if (a.type !== 'cutoff') continue;
    for (const [b, param] of Object.entries(a.byBand)) {
      const at = valueOf<string>(rule, param);
      if ((band === null || b === band || b === '*') && at && !Number.isNaN(new Date(at).getTime())) out.add(param);
    }
  }
  return out;
}

/** Whether a slot's words (in the customer's language) name every one of these params of the rule itself. */
function namesAll(rule: Pick<Rule, 'text'>, slot: TextSlot, params: ReadonlySet<string>, locale: string): boolean {
  const t = pick(rule.text[slot], langOf(locale));
  if (!t) return false;
  const named = new Set(tokensIn(t.text).filter((x) => x.rule === null).map((x) => x.key));
  return [...params].every((p) => named.has(p));
}

/**
 * The words an open line uses: the short words when they name the time of every band the line speaks for (the
 * customer's band, or every band when it is not known), else the full words when they do, else none (null).
 */
export function openSlot(rule: Rule, band: string | null, locale: string): TextSlot | null {
  const params = cutParams(rule, band);
  for (const slot of ['short', 'full'] as const) if (namesAll(rule, slot, params, locale)) return slot;
  return null;
}

/** Open (with the next time ahead) or closed, for one band or for every band; none: no time applies. */
export function festiveState(cuts: readonly FestiveCut[], band: string | null, now: Date): FestiveState {
  const mine = band === null ? cuts : cuts.filter((c) => c.band === band || c.band === '*');
  if (!mine.length) return { state: 'none' };
  const ahead = mine.filter((c) => new Date(c.at) > now).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return ahead.length ? { state: 'open', next: ahead[0]!.at } : { state: 'closed' };
}

export interface FestiveAsk {
  /** The place the shop draws (`announcement` = the home page, `product`, `checkout`); a rule shows only where placed. */
  placement: string;
  /** The customer's band; null: not known yet (every band counts). */
  band: string | null;
  now: Date;
  /** Only `closed` lines (checkout: what replaces the usual promise), only `open`, or both (default). */
  want?: 'open' | 'closed' | 'both';
}

/** The lines of the live festive rules at a place, in the rules' resolution order as given. */
export function festiveLinesOf(rules: readonly Rule[], ask: FestiveAsk, ctx: TextContext, others?: ReadonlyMap<string, WindowedParams>): FestiveLine[] {
  const want = ask.want ?? 'both';
  const bn = ctx.locale.toLowerCase().startsWith('bn');
  const out: FestiveLine[] = [];
  for (const r of rules) {
    if (r.kind !== 'festive' || !isLive(r, ask.now) || !r.placements.includes(ask.placement)) continue;
    const st = festiveState(festiveCuts(r), ask.band, ask.now);
    if (st.state === 'none' || (want !== 'both' && st.state !== want)) continue;
    const slot = st.state === 'open' ? openSlot(r, ask.band, ctx.locale) : 'after';
    if (!slot) continue;
    const t = ruleText(r, slot, ctx, { others });
    if (!t?.ok) continue;
    out.push({ key: r.key, name: (bn && r.nameBn?.trim()) || r.nameEn, text: t.text.trim(), state: st.state });
  }
  return out;
}
