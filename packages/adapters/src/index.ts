// @extas/adapters — the adapter framework (PR 18): mock / sandbox / live for every integration, the Test button, and
// the storage adapter (local disk, Azure Blob, S3-compatible). Later integrations (couriers, SMS, payments, AI …) add
// their adapter definitions next to storage/ and register them in `allAdapters`.
import { erpAdapters } from './erp';
import { storageAdapters } from './storage';

export * from './define';
export * from './connections';
export * from './catalogue';
export * from './storage';
// PR 194, 497, 498 — the ERP adapters (the generic contract, the shop's own ERP, the practice ERP behind MOCK).
export * from './erp';

export const allAdapters = [...storageAdapters, ...erpAdapters] as const;
