// PR 64 — the detail accordions (Blueprint D3.6, demo 30-product.js pdp_details / pdp_acc): Fabric & care, Size & fit
// and Description, in the owner's order, each closed, open, or open to its first line with "Read more"
// (`pdp.details.blocks`). A block with nothing written is left out. Pure.
import type { PdpDetailsSettings } from '@extas/settings';

export type DetailId = PdpDetailsSettings['blocks'][number]['id'];
export type DetailOpen = PdpDetailsSettings['blocks'][number]['open'];

export interface DetailContent {
  fabric: string | null;
  care: string[];
  fit: string | null;
  fitNote: string | null;
  description: string | null;
}

/** The care text as a list: the owner writes it one instruction per line, or joined with " · " (the sample data). */
export function careList(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\n|\s·\s/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** The fabric line: the fabric's name, with its weight when the name does not already say it. */
export function fabricLine(name: string | null, gsm: number | null, gsmWords: (n: number) => string): string | null {
  const n = name?.trim() || null;
  if (!gsm || gsm <= 0) return n;
  if (n && /\bgsm\b/i.test(n)) return n;
  return n ? `${n} · ${gsmWords(gsm)}` : gsmWords(gsm);
}

/** The blocks to draw, in order, each with how it opens. */
export function detailBlocks(set: PdpDetailsSettings, c: DetailContent): { id: DetailId; open: DetailOpen }[] {
  const has: Record<DetailId, boolean> = {
    fabric: !!c.fabric || c.care.length > 0,
    fit: !!c.fit || !!c.fitNote,
    desc: !!c.description?.trim(),
  };
  return set.blocks.filter((b) => b.on && has[b.id]).map((b) => ({ id: b.id, open: b.open }));
}

/** The next state of an accordion on a tap: a peeking block opens fully, an open one closes, a closed one opens. */
export function nextOpen(cur: DetailOpen): DetailOpen {
  return cur === 'peek' ? 'open' : cur === 'open' ? 'closed' : 'open';
}

/** The pieces of the page facts (`Product.pdpBlocks`): the fit words and the fit note. */
export function pageFacts(blocks: unknown): { fit: string | null; fitNote: string | null } {
  const b = blocks && typeof blocks === 'object' && !Array.isArray(blocks) ? (blocks as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return { fit: str(b.fit), fitNote: str(b.fitNote) };
}
