// @extas/settings — the settings framework (PR 491), the two-tier resolver (PR 492), the settings migration (PR 496)
// and reset to default (PR 510). Nothing a human might change lives in code: it is declared here and read through the
// resolver.
export * from './define';
export * from './errors';
export * from './resolve';
export * from './backend';
export * from './resolver';
export * from './prisma-backend';
export * from './sync';
export * from './admin';
export * from './owner-data';
export * from './owner-values';
export * from './schemas';
export * from './registry-media';
export * from './registry-publish';
export * from './registry-merch';
export * from './registry-inventory';
export * from './registry-catalogue-tools';
export * from './registry-rules';
export * from './registry-combos';
export * from './registry-delivery';
export * from './registry-storefront';
export * from './registry-eid';
export * from './registry-category';
export * from './registry-bag';
export * from './registry-product';
export * from './registry-checkout';
export * from './registry-shop-more';
export * from './registry-search';
export * from './registry-storefront-fu';
export * from './registry-pdp-templates';
export * from './registry-accounts';
export * from './registry-motion';
export * from './registry-admin-look';
export * from './registry-admin-shell';
export { messages, lookup, pair, type MessageTree, type SettingsMessages, type LabelPair } from './messages';
export * from './registry-orders';
export * from './registry-checkout-more';
export * from './registry-reviews';
export * from './registry-set-builder';
export * from './registry-support-lane';
export * from './registry-messages';
export * from './registry-message-channels';
export * from './registry-risk';
export * from './registry-risk-more';
export * from './registry-payments';
export * from './registry-risk-rules';
export * from './registry-shipping';
export * from './registry-cache';
export * from './registry-advance';
export * from './registry-risk-levels';
export * from './registry-risk-s06';
export * from './registry-advance-request';
export * from './registry-wallet';
export * from './registry-courier-sync';
export * from './registry-fulfilment';
export * from './registry-customers';
// S11 · PR 220–222 — the SEO engine's settings (registry-seo.ts, version 64).
export * from './registry-seo';
export * from './registry-seo-reach';
export * from './registry-erp-v6';
export * from './registry-invoice';
export * from './registry-support';
export * from './registry-erp-orders-v6';
// CN-028 · PR 615, 616 — the ERP account ledger and the books match (registry-books.ts, version 68).
export * from './registry-books';
// CN-028 · PR 612–614 — returns and exchanges on the ERP model (registry-returns-v6.ts, version 67).
export * from './registry-returns-v6';
// CN-028 · PR 619, 621 — the switch-over, the ERP link page and the acceptance suite (registry-switchover.ts, version 70).
export * from './registry-switchover';
// S19 · PR 395, 507 — the backups (registry-backups.ts, versions 75–76).
export * from './registry-backups';
// CN-033 — the shop follows the ERP's retail decisions of 30 Oct 2026 (registry-erp-retail.ts, version 72).
export * from './registry-erp-retail';
// S22 · PR 426 — the Support channel connectors (registry-support-channels.ts, version 72).
export * from './registry-support-channels';
// S16 · PR 343 — the cost ledger (registry-costs.ts, version 77).
export * from './registry-costs';
// S08 · PR 192 — the RTO cost book switch, courier claims, rider issues (registry-courier-report.ts, version 93).
export * from './registry-courier-report';
// S08 · PR 193 — holiday mode (registry-holiday.ts, version 94).
export * from './registry-holiday';
// S08 · PR 564 — the charge mismatch log (registry-charge-mismatch.ts, version 95).
export * from './registry-charge-mismatch';
// SIM-F-048 · PR 179 follow-up — the sticker's Latin address line (registry-sticker-latin.ts, version 96).
export * from './registry-sticker-latin';
// SIM-F-048 · PR 550 follow-up — the delivery promise per district (registry-district-promise.ts, version 97).
export * from './registry-district-promise';
// CN-018 (4) · PR 89 follow-up — sets Fixed or Flexible and the split-price rule (registry-combo-split.ts, version 98).
export * from './registry-combo-split';
// CN-020 (3) — "Call me" when someone struggles at checkout (registry-call-me.ts, version 99).
export * from './registry-call-me';
// CN-020 (4) — the voice address at checkout (registry-voice-address.ts, version 140).
export * from './registry-voice-address';
export * from './registry-bhandari-p1';
export * from './registry-books-summary';
// S18 · PR 378 — page protection and the per-address request limits (registry-web-security.ts, version 73).
export * from './registry-web-security';
// S18 · PR 379 — the quiet bot check (registry-bot-check.ts, version 74).
export * from './registry-bot-check';
// S18 · PR 380 — the admin address list and the new-login notes (registry-admin-access.ts, version 78).
export * from './registry-admin-access';
// S18 · PR 382 — customers' erasure requests (registry-privacy.ts, version 79).
export * from './registry-privacy';
// S18 · PR 386 — the shop's protection at Cloudflare (registry-edge.ts, version 80).
export * from './registry-edge';
// S21 · PR 413 — the Site health hub (registry-health.ts, version 81).
export * from './registry-health';
// S11 · PR 588 — the Bengali translation gate (registry-bengali.ts, version 84).
export * from './registry-bengali';
// S13 · PR 257 — server-side event tracking (registry-tracking.ts, version 85).
export * from './registry-tracking';
// S13 · PR 257 follow-up — where an order came from (registry-attribution.ts, version 230).
export * from './registry-attribution';
// S02 · PR 75 follow-up — the contact page's form (registry-contact-form.ts, version 231).
export * from './registry-contact-form';
// S18 · PR 383 — the placeholder guard for the owner's details the shop prints (placeholder.ts).
export * from './placeholder';
export { registry, localeSchema, timeZoneSchema, currencySchema, hostSchema, type Registry, type Key, type Value } from './registry';
