// @extas/adapters — the adapter framework (PR 18): mock / sandbox / live for every integration, the Test button, and
// the storage adapter (local disk, Azure Blob, S3-compatible), and the payment gateways (PR 167). Later integrations (couriers, SMS, payments, AI …) add
// their adapter definitions next to storage/ and register them in `allAdapters`. The page reader (PR 33) reads a
// supplier's product page for the catalogue's import from a link.
import { erpAdapters } from './erp';
import { pageReaderAdapters } from './page-reader';
import { storageAdapters } from './storage';
import { liveSmsAdapters, smsAdapters } from './sms';
import { liveWhatsAppAdapters, whatsappAdapters } from './whatsapp';
import { emailAdapters } from './email';
import { paymentAdapters } from './payment';
import { keyedCourierAdapters } from './courier';
import { fraudCheckAdapters } from './fraud-check';
import { cdnAdapters } from './cdn';
import { telegramAdapters } from './telegram';
import { certificateAdapters } from './certificate';
import { googleDriveAdapters } from './google-drive';
import { liveMessengerAdapters, messengerAdapters } from './messenger';
import { searchConsoleAdapters } from './search-console';
import { adEventAdapters } from './ads';
import { speechAdapters } from './speech';

export * from './define';
export * from './connections';
export * from './catalogue';
export * from './storage';
// PR 194, 497, 498 — the ERP adapters (the generic contract, the shop's own ERP, the practice ERP behind MOCK).
export * from './erp';
export * from './page-reader';
// PR 130 — the SMS sender: the mock until the gateway's key arrives; PR 291 the real gateway (BulkSMSBD, sms/).
export * from './sms';
// PR 148 — the WhatsApp and e-mail senders of the order journey: mocks until their keys arrive (like the SMS sender);
// PR 292 the WhatsApp Business Platform (whatsapp/cloud.ts) with its webhook's signature and receipts.
export * from './whatsapp';
export * from './email';
// PR 167 — the payment gateways: one contract, the practice gateway behind MOCK, bKash (Nagad and card follow).
export * from './payment';
// S08 · PR 175 — the courier contract, the practice courier and its scripted worlds (courier/).
export * from './courier';
// S06 · PR 567 — the courier fraud checks (Steadfast's, Pathao's, an aggregator's) behind one contract (fraud-check/).
export * from './fraud-check';
// PR 602 — the CDN (Cloudflare): dropping what it keeps; the mock until the owner types its token.
export * from './cdn';
// S19 · PR 392 — Telegram alerts to the owner's bot: the mock until the token and the chat are entered and tested.
export * from './telegram';
// S19 · PR 397 — the Cloudflare Origin certificate (Full (strict)): read and checked here, installed by the server.
export * from './certificate';
// S19 · PR 395 (CN-030) — Google Drive for the backups: the device-code sign-in, the Drive client and the fake Google.
export * from './google-drive';
// S22 · PR 426 — Facebook Messenger (the Page's messages) for the Support inbox: the mock until the Page's keys arrive.
export * from './messenger';
// S11 · PR 233 — Google Search Console and Bing Webmaster: the properties and the sitemap; the mock until a key is in.
export * from './search-console';
// S11 · PR 221 — the AI writer (search titles and descriptions): the practice writer until an AI provider is connected
// (not in `allAdapters` until then; see ai-writer/index.ts).
export * from './ai-writer';
// S13 · PR 257 — the ad platforms' server event APIs (Meta Conversions API, Google Analytics 4, TikTok Events API):
// mocks until their keys are in and their tests pass.
export * from './ads';
// CN-020 (4) — speech to text for the checkout's voice address (Google Cloud Speech-to-Text; the mock hears nothing).
export * from './speech';

/** PR 148 — every message sender (SMS, WhatsApp, e-mail) for `createConnections` in the message engine. */
export const messageAdapters = [...smsAdapters, ...whatsappAdapters, ...emailAdapters] as const;

// PR 176: the couriers with keys (Steadfast) are rows of Keys & connections; the practice courier is not. PR 567: the
// courier fraud checks too. PR 291: the SMS
// gateway too (its key and Test button); PR 292 the WhatsApp Business Platform; the mock senders are not.
export const allAdapters = [...storageAdapters, ...erpAdapters, ...pageReaderAdapters, ...paymentAdapters, ...keyedCourierAdapters, ...fraudCheckAdapters, ...cdnAdapters, ...telegramAdapters, ...certificateAdapters, ...googleDriveAdapters, ...liveSmsAdapters, ...liveWhatsAppAdapters, ...liveMessengerAdapters, ...searchConsoleAdapters, ...adEventAdapters, ...speechAdapters] as const;

/** PR 426 — the Support inbox's channels (WhatsApp, Messenger) for `createConnections`: each falls back to its mock. */
export const supportAdapters = [...whatsappAdapters, ...messengerAdapters] as const;
