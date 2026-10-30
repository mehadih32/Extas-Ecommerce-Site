// PR 607 (CN-028) — ERP contract v6 in the adapter. The wire shapes, the answer schemas and the v6 events live in the
// shared types package (`@extas/erp-types`, CN-029 Phase 0) so every lane writes against one copy; they are re-exported
// here unchanged, and the adapter adds the reads every ERP adapter that speaks v6 offers (`ErpApi.v6`).
import type { ErpAccount, ErpClaim, ErpCostOfGoodsRow, ErpExchange, ErpFixedCostMonth, ErpOrderAnswer, ErpReturnItem, ErpReturnsSummary, ErpStoredSummary, ErpSwitchOver } from '@extas/erp-types/contract-v6';

export * from '@extas/erp-types/contract-v6';

/** The v6 reads every ERP adapter that speaks v6 offers (`ErpApi.v6`). Writes go through `push` as documents. */
export interface ErpV6Reads {
  /** Every SKU of one style (`GET /catalog/variants?styleCode=`), all pages. */
  variantsByStyle(styleCode: string, o?: { timeoutMs?: number }): Promise<import('./contract').ErpVariantRow[]>;
  account(q?: { from?: string; to?: string }, o?: { timeoutMs?: number }): Promise<ErpAccount>;
  returns(q: { updatedSince?: Date | null; cursor?: string | null; limit: number }, o?: { timeoutMs?: number }): Promise<{ items: ErpReturnItem[]; nextCursor: string | null; rejected: { index: number; reason: string }[] }>;
  returnsSummary(date: string, o?: { timeoutMs?: number }): Promise<ErpReturnsSummary>;
  returnClaims(q: { from: string; to: string }, o?: { timeoutMs?: number }): Promise<ErpClaim[]>;
  exchanges(q: { status?: 'pending' | 'all'; updatedSince?: Date | null; cursor?: string | null; limit: number }, o?: { timeoutMs?: number }): Promise<{ items: ErpExchange[]; totalAtRisk: string; nextCursor: string | null; rejected: { index: number; reason: string }[] }>;
  dailySummaries(q: { from: string; to: string }, o?: { timeoutMs?: number }): Promise<ErpStoredSummary[]>;
  fixedCosts(o?: { timeoutMs?: number }): Promise<ErpFixedCostMonth[]>;
  costOfGoods(q: { from: string; to: string }, o?: { timeoutMs?: number }): Promise<ErpCostOfGoodsRow[]>;
  /** PR 619 — `GET /switch-over`: the store's switch date, the orders the ERP moved, the transfer and the opening balance. */
  switchOver(o?: { timeoutMs?: number }): Promise<ErpSwitchOver>;
  /** `GET /orders/{externalOrderId}`: the order with `erpTotal`, `billedAt`, line shop prices and exchange fields. */
  order(externalOrderId: string, o?: { timeoutMs?: number }): Promise<ErpOrderAnswer>;
}
