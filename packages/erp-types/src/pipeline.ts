// CN-028 · PR 615 (CN-029 Phase 0) — the pipeline stock (docs/RETAIL-ERP-MODEL.md §3.2): every piece billed and not yet
// delivered, approved or declined, at the buying price. The shop builds it from its own piece states (ErpPipelinePiece,
// every move in ErpPipelineMove), never from the ERP, so it is an independent check of the ERP account.

/** A billed piece's state (Prisma enum ErpPieceState, same values in the same order). */
export const ERP_PIECE_STATES = ['BILLED', 'RETURNING', 'WAITING_CHECK', 'DELIVERED', 'APPROVED', 'DECLINED'] as const;
export type ErpPieceState = (typeof ERP_PIECE_STATES)[number];

/** The states that are in the pipeline. WAITING_CHECK is the part that equals the ERP's `waitingCheck`. */
export const IN_PIPELINE: ReadonlySet<ErpPieceState> = new Set(['BILLED', 'RETURNING', 'WAITING_CHECK']);

/** How a piece leaves the pipeline, and which P&L line its buying price lands on (none for an approved piece). */
export const PIPELINE_EXIT: Readonly<Record<'DELIVERED' | 'APPROVED' | 'DECLINED', 'goods' | 'credit' | 'returnLosses'>> = {
  DELIVERED: 'goods',
  APPROVED: 'credit',
  DECLINED: 'returnLosses',
};

/**
 * The moves a piece may make. Out of the pipeline is final, except a later `DIFFERENT_PIECE` decision or an ERP
 * correction (a reversal), which restates the piece from where the correction puts it (§10): those moves are listed too.
 */
export const PIECE_MOVES: Readonly<Record<ErpPieceState, readonly ErpPieceState[]>> = {
  BILLED: ['DELIVERED', 'RETURNING', 'WAITING_CHECK'],
  RETURNING: ['WAITING_CHECK', 'DELIVERED'],
  WAITING_CHECK: ['APPROVED', 'DECLINED'],
  DELIVERED: ['RETURNING', 'WAITING_CHECK'],
  APPROVED: ['WAITING_CHECK', 'DECLINED'],
  DECLINED: ['WAITING_CHECK', 'APPROVED'],
};

export const isInPipeline = (s: ErpPieceState): boolean => IN_PIPELINE.has(s);

export function canMove(from: ErpPieceState | null, to: ErpPieceState): boolean {
  if (from === null) return to === 'BILLED';
  return PIECE_MOVES[from].includes(to);
}

export interface PipelinePieceView {
  state: ErpPieceState;
  /** The buying price on the bill, minor units. */
  buyingPriceMinor: number;
}

/** The pipeline value I and its WAITING_CHECK part, at buying price (minor units). */
export function pipelineValue(pieces: readonly PipelinePieceView[]): { totalMinor: number; waitingCheckMinor: number; pieces: number } {
  let totalMinor = 0;
  let waitingCheckMinor = 0;
  let n = 0;
  for (const p of pieces) {
    if (!IN_PIPELINE.has(p.state)) continue;
    totalMinor += p.buyingPriceMinor;
    if (p.state === 'WAITING_CHECK') waitingCheckMinor += p.buyingPriceMinor;
    n++;
  }
  return { totalMinor, waitingCheckMinor, pieces: n };
}
