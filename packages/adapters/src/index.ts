// @extas/adapters — the adapter framework (PR 18): mock / sandbox / live for every integration, the Test button, and
// the storage adapter (local disk, Azure Blob, S3-compatible), and the payment gateways (PR 167). Later integrations (couriers, SMS, payments, AI …) add
// their adapter definitions next to storage/ and register them in `allAdapters`. The page reader (PR 33) reads a
// supplier's product page for the catalogue's import from a link.
import { erpAdapters } from './erp';
import { pageReaderAdapters } from './page-reader';
import { storageAdapters } from './storage';
import { smsAdapters } from './sms';
import { whatsappAdapters } from './whatsapp';
import { emailAdapters } from './email';
import { paymentAdapters } from './payment';

export * from './define';
export * from './connections';
export * from './catalogue';
export * from './storage';
// PR 194, 497, 498 — the ERP adapters (the generic contract, the shop's own ERP, the practice ERP behind MOCK).
export * from './erp';
export * from './page-reader';
// PR 130 — the SMS sender: the mock until the gateway's key arrives (not in `allAdapters` until then; see sms/index.ts).
export * from './sms';
// PR 148 — the WhatsApp and e-mail senders of the order journey: mocks until their keys arrive (like the SMS sender).
export * from './whatsapp';
export * from './email';
// PR 167 — the payment gateways: one contract, the practice gateway behind MOCK, bKash (Nagad and card follow).
export * from './payment';
// S08 · PR 175 — the courier contract, the practice courier and its scripted worlds (courier/).
export * from './courier';

/** PR 148 — every message sender (SMS, WhatsApp, e-mail) for `createConnections` in the message engine. */
export const messageAdapters = [...smsAdapters, ...whatsappAdapters, ...emailAdapters] as const;

export const allAdapters = [...storageAdapters, ...erpAdapters, ...pageReaderAdapters, ...paymentAdapters] as const;
