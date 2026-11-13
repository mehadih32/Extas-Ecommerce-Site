// S28 · PR 704 — the pure side of the bulk and corporate orders screen (no database, no server imports, so the screen
// and the tests both use it): the figures of a quote, the batch split, the state a quote is in, and the size-text reader.
const DAY_MS = 86_400_000;


export interface BulkLine {
  name: string;
  colour: string;
  sizes: Record<string, number>;
}
export interface BulkTier {
  from: number;
  minor: number;
}
export interface PriceInput {
  pricing: 'PIECE' | 'TIER';
  pieceMinor: number;
  tiers: readonly BulkTier[];
}

export const piecesOf = (lines: readonly BulkLine[]): number => lines.reduce((n, l) => n + Object.values(l.sizes).reduce((a, b) => a + b, 0), 0);

/** The unit price for `pieces`: the one agreed price, or the tier with the biggest `from` the pieces reach (the first tier below it). */
export function unitMinorFor(p: PriceInput, pieces: number): number {
  if (p.pricing === 'PIECE') return p.pieceMinor;
  const sorted = [...p.tiers].sort((a, b) => a.from - b.from);
  let unit = sorted[0]?.minor ?? 0;
  for (const t of sorted) if (pieces >= t.from) unit = t.minor;
  return unit;
}

export interface Figures {
  pieces: number;
  unitMinor: number;
  totalMinor: number;
  advanceMinor: number;
  balanceMinor: number;
}

export function figures(lines: readonly BulkLine[], p: PriceInput, advancePct: number): Figures {
  const pieces = piecesOf(lines);
  const unitMinor = unitMinorFor(p, pieces);
  const totalMinor = pieces * unitMinor;
  const advanceMinor = Math.round((totalMinor * advancePct) / 100);
  return { pieces, unitMinor, totalMinor, advanceMinor, balanceMinor: totalMinor - advanceMinor };
}

/** Pieces over `count` batches as evenly as whole pieces allow (the first batches take the odd pieces); planned days from `start`, `gapDays` apart. */
export function splitBatches(pieces: number, count: number, start: Date, firstAfterDays: number, gapDays: number): { no: number; pieces: number; plannedOn: string }[] {
  const n = Math.max(1, Math.min(count, pieces || 1));
  const base = Math.floor(pieces / n);
  const extra = pieces % n;
  return Array.from({ length: n }, (_, i) => ({
    no: i + 1,
    pieces: base + (i < extra ? 1 : 0),
    plannedOn: new Date(start.getTime() + (firstAfterDays + i * gapDays) * DAY_MS).toISOString().slice(0, 10),
  }));
}

export const BATCH_NEXT = { WAITING: 'PACKED', PACKED: 'SHIPPED', SHIPPED: 'DELIVERED' } as const;
export type BatchStatus = 'WAITING' | 'PACKED' | 'SHIPPED' | 'DELIVERED';

export type QuoteState = 'QUOTE_SENT' | 'IN_DELIVERY' | 'BALANCE_DUE' | 'DONE';
export function stateOf(q: { advanceReceivedAt: unknown; balanceReceivedAt: unknown }, batches: readonly { status: string }[]): QuoteState {
  if (q.balanceReceivedAt) return 'DONE';
  if (!q.advanceReceivedAt) return 'QUOTE_SENT';
  return batches.length > 0 && batches.every((b) => b.status === 'DELIVERED') ? 'BALANCE_DUE' : 'IN_DELIVERY';
}

/** "S 10, M 20" or "S:10 M:20" → { S: 10, M: 20 }; null when a part is not a size and a number. */
export function parseSizes(text: string): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const part of text.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^([^\s:=]+)\s*[:=\s]\s*(\d+)$/.exec(part);
    if (!m) return null;
    out[m[1]!] = (out[m[1]!] ?? 0) + Number(m[2]);
  }
  return out;
}
