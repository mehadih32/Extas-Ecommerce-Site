// @extas/adapters — the adapter framework (PR 18): mock / sandbox / live for every integration, the Test button, and
// the storage adapter (local disk, Azure Blob, S3-compatible). Later integrations (couriers, SMS, payments, AI …) add
// their adapter definitions next to storage/ and register them in `allAdapters`. The page reader (PR 33) reads a
// supplier's product page for the catalogue's import from a link.
import { erpAdapters } from './erp';
import { pageReaderAdapters } from './page-reader';
import { storageAdapters } from './storage';

export * from './define';
export * from './connections';
export * from './catalogue';
export * from './storage';
// PR 194, 497, 498 — the ERP adapters (the generic contract, the shop's own ERP, the practice ERP behind MOCK).
export * from './erp';
export * from './page-reader';
// PR 130 — the SMS sender: the mock until the gateway's key arrives (not in `allAdapters` until then; see sms/index.ts).
export * from './sms';

export const allAdapters = [...storageAdapters, ...erpAdapters, ...pageReaderAdapters] as const;
