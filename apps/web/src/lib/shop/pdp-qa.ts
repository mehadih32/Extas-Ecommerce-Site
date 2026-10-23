// PR 66 — the "Questions & answers" block of the product page, as a plain model (demo 30-product.js pdp_qaSection,
// R14 14.14): which question opens the block with its answer, which are folded under it, how many show before
// "See all questions", and where the WhatsApp ask goes. Only questions the shop answered and approved reach it
// (pdp-qa-load.ts); nothing here makes one up. No answered question: the block is only the WhatsApp ask, and without a
// WhatsApp number there is no block at all.
import type { PdpQaSettings } from '@extas/settings';

export interface QaRow {
  id: string;
  question: string;
  answer: string;
  /** ISO time the answer was given, when it was recorded. */
  answeredAt: string | null;
}

export type QaView =
  | { kind: 'ask' }
  | {
      kind: 'list';
      /** The question shown open in its own box, with its answer (`featured` on). */
      featured: QaRow | null;
      /** Folded under it: the first `shown` straight away, the rest behind "See all questions". */
      first: QaRow[];
      rest: QaRow[];
      /** Where the WhatsApp ask sits: under the open answer on a computer and under the list on a phone, or, with one
       *  box only, under that box everywhere. */
      ask: 'split' | 'featured' | 'list' | null;
    };

/** The block for a product's answered questions (newest answer first), or null: no block. */
export function qaView(rows: readonly QaRow[], set: PdpQaSettings, hasWhatsapp: boolean): QaView | null {
  if (!set.on) return null;
  const wa = set.askWhatsapp && hasWhatsapp;
  const list = rows.filter((r) => r.question.trim() && r.answer.trim()).slice(0, set.max);
  if (!list.length) return wa ? { kind: 'ask' } : null;
  const featured = set.featured ? list[0]! : null;
  const folded = set.featured ? list.slice(1) : list;
  const first = folded.slice(0, set.shown);
  const rest = folded.slice(set.shown);
  const ask = !wa ? null : featured && folded.length ? 'split' : featured ? 'featured' : 'list';
  return { kind: 'list', featured, first, rest, ask };
}
