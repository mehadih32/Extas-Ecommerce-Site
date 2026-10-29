// The ERP adapters (PR 194, 497, 498): the generic contract every ERP answers, the HTTP client of the ERP ↔ shop API
// contract, the practice ERP behind MOCK mode, request signing, and the shop's own ERP adapter. A second ERP is one
// more adapter of kind ERP answering `ErpApi`, listed in `erpAdapters` and in the connection catalogue.
import { extasErp } from './extas-erp';

export * from './contract';
// PR 607 (CN-028) — contract v6 and the practice ERP's v6 books.
export * from './v6';
export * from './mock-erp-v6';
export * from './http-client';
export * from './mock-erp';
export * from './signature';
export * from './extas-erp';
export * from './webhook';

export const erpAdapters = [extasErp] as const;
