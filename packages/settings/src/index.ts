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
export * from './registry-admin-theme';
export * from './registry-admin-patterns';
export * from './registry-admin-today';
export * from './registry-erp-replay';
export * from './registry-erp-held';
export * from './registry-health-reopen';
export * from './registry-login-network';
export * from './registry-exchange-retry';
export * from './registry-support-file-copy';
export * from './registry-admin-shell';
export { messages, lookup, pair, type MessageTree, type SettingsMessages, type LabelPair } from './messages';
export * from './registry-orders';
export * from './registry-checkout-more';
export * from './registry-reviews';
export * from './registry-set-builder';
export * from './registry-support-lane';
export * from './registry-messages';
export * from './registry-crm';
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
// S20 · PR 404 — what one print run prints (registry-print-run.ts, version 150).
export * from './registry-print-run';
// S22 · PR 427 — identity resolution in the Support inbox (registry-support-identity.ts, version 155).
export * from './registry-support-identity';
// S22 · PR 428 — the customer beside a support chat (registry-support-context.ts, version 156).
export * from './registry-support-context';
// S22 · PR 429 — the catalogue drawer in a support chat (registry-support-catalogue.ts, version 157).
export * from './registry-support-catalogue';
// S22 · PR 430 — orders from a support chat: the chat bag and its fraud gate (registry-support-cart.ts, version 158).
export * from './registry-support-cart';
// S22 · PR 431 — ticketing: the first-answer and solution timers of each support question (registry-support-tickets.ts, version 159).
export * from './registry-support-tickets';
// S22 · PR 432 — draft answers in a support chat (registry-support-drafts.ts, versions 180–182).
export * from './registry-support-drafts';
// S22 · PR 433 — follow-ups on chats without an order (registry-support-followup.ts, versions 183–184).
export * from './registry-support-followup';
// S22 · PR 434 — privacy inside support and the block list (registry-support-privacy.ts, versions 185–186).
export * from './registry-support-privacy';
// S22 · PR 435 — the support app: installable, support-only frame, push notifications (registry-support-app.ts, version 187).
export * from './registry-support-app';
// S22 · PR 538 — desk hours, telling the owner when nobody answers, the links customers send (registry-support-escalation.ts, version 188).
export * from './registry-support-escalation';
// S22 · PR 624 (CN-034) — the Messenger button on the shop and the store's Page (registry-support-messenger.ts, version 189).
export * from './registry-support-messenger';
// S04 · PR 622 (CN-034) — Buy again on a past order (registry-account-reorder.ts, version 220).
export * from './registry-account-reorder';
// S18 · PR 623 (CN-034) — the customer's own privacy request (registry-privacy-customer.ts, version 221).
export * from './registry-privacy-customer';
export * from './registry-bhandari-p1';
export * from './registry-books-summary';
// S18 · PR 378 — page protection and the per-address request limits (registry-web-security.ts, version 73).
export * from './registry-web-security';
// S19 · PR 652 — the closed stages hidden by a switch (registry-closed-stages.ts, version 235).
export * from './registry-closed-stages';
// S12 · PR 251 — comments on articles, or the journal without comments (registry-blog-comments.ts, version 250).
export * from './registry-blog-comments';
// S12 · PR 547 — the journal articles' main photo, own pictures only (registry-blog-images.ts, version 252).
export * from './registry-blog-images';
// S12 · PR 592 — the journal's house ads and popup rules (registry-house-ads.ts, version 253).
export * from './registry-house-ads';
// S12 · PR 591 — the blog content pipeline: pace, queue and health (registry-blog-pipeline.ts, version 254).
export * from './registry-blog-pipeline';
// S13 · PR 569 — geography-led ad guidance, advice only (registry-geo-guide.ts, version 255).
export * from './registry-geo-guide';
// S13 · PR 589 — the Google Merchant Center product feed (registry-merchant-feed.ts, version 256; follow-ups 259, 260).
export * from './registry-merchant-feed';
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
// S16 · CN-031 lane B — finance, costs & reports (registry-finance.ts, versions 160–169).
export * from './registry-finance';
// S11 · PR 588 — the Bengali translation gate (registry-bengali.ts, version 84).
export * from './registry-bengali';
// S13 · PR 257 — server-side event tracking (registry-tracking.ts, version 85).
export * from './registry-tracking';
// S13 · PR 257 follow-up — where an order came from (registry-attribution.ts, version 230).
export * from './registry-attribution';
// S02 · PR 75 follow-up — the contact page's form (registry-contact-form.ts, version 231).
export * from './registry-contact-form';
// S13 · CN-031 lane B — marketing: landing pages (registry-marketing.ts, versions 168–179).
export * from './registry-marketing';
// S12 · CN-031 lane A — the journal (registry-journal.ts, versions 222–229).
export * from './registry-journal';
// S12 · CN-031 lane A · PR 246 — seasonal landing pages (registry-seasonal.ts, version 228).
export * from './registry-seasonal';
// S12 · PR 530 — the seasonal pages' yearly return (registry-seasonal-return.ts, version 251).
export * from './registry-seasonal-return';
// S13 · CN-031 lane B · PR 263 — audiences sent to the ad platforms (registry-ads-audiences.ts, version 170).
export * from './registry-ads-audiences';
// S13 · CN-031 lane B · PR 264 — the refused-parcel exclusion list and the daily audience refresh (registry-ads-refused.ts, version 171).
export * from './registry-ads-refused';
// S13 · CN-031 lane B · PR 265 — the daily ad spend import (registry-ads-spend.ts, version 172).
export * from './registry-ads-spend';
export * from './registry-ads-alerts';
export * from './registry-ads-control';
// S13 · PR 531 — the campaign builder switch (registry-ads-builder.ts, version 219).
export * from './registry-ads-builder';
// S13 · PR 532 — the deep conversion feed (registry-conversion-feed.ts, version 232; follow-ups 661 v261, 664 v262).
export * from './registry-conversion-feed';
// S13 · PR 269 — the AI growth agent's limits (registry-ads-growth.ts, version 175).
export * from './registry-ads-growth';
// S13 · PR 270 — the ad creative brief's settings (registry-ads-brief.ts, version 176).
export * from './registry-ads-brief';
// S13 · PR 272 — how coupon codes reach people: links and single-use batches (registry-coupons-distribution.ts, version 177).
export * from './registry-coupons-distribution';
// S13 · PR 273 — the referral programme: switch, window, the friend's rule, the sharer's reward (registry-referrals.ts, version 178).
export * from './registry-referrals';
// S13 · PR 274 — when an unfinished checkout counts as left on Orders › Incomplete (registry-incomplete.ts, version 179).
export * from './registry-incomplete';
// S13 · PR 275 — the follow-up ladder of an unfinished checkout, at most two messages (registry-follow-up.ts, version 210).
export * from './registry-follow-up';
// S13 · PR 276 — abandoned-bag recovery of signed-in customers, with the offer rules (registry-cart-recovery.ts, version 211).
export * from './registry-cart-recovery';
// S13 · PR 277 — the campaign blast to a saved segment (registry-blast.ts, version 212).
export * from './registry-blast';
// S13 · PR 278 — the YouTube module's switch and its tracked link's campaign tags (registry-youtube.ts, version 213).
export * from './registry-youtube';
// S13 · PR 279 — the SEO outreach pipeline's switch, its follow-up gap and the owner's pitch words (registry-outreach.ts, version 214).
export * from './registry-outreach';
// S13 · PR 280 — seasonal home-page switching's switch (registry-seasonal-home.ts, version 215); its bell notes (version 249).
export * from './registry-seasonal-home';
// S13 · PR 281 — festive cut-off words on the shop: the switch, where, the heading and the link (registry-festive-cutoff.ts, version 216).
export * from './registry-festive-cutoff';
// S02 · PR 80 follow-up 679 — the demo's eye-toggle parts: login line, door note, desktop help strip, send the bag on WhatsApp, the set line, the thank-you upsell (registry-eye-parts.ts, version 265).
export * from './registry-eye-parts';
// S05 · PR 541 follow-up 320 — prepaid orders that nothing flagged confirm by themselves once paid (registry-prepaid-confirm.ts, version 266).
export * from './registry-prepaid-confirm';
// S14 · PR 286 follow-up 477 — repeated opens of a customer's page fold into one line with a count (registry-looks-fold.ts, version 267).
export * from './registry-looks-fold';
// S06 · PR 159 follow-up 324 — where the team uses a shared location: the order page's map link, the sticker (registry-shared-location.ts, version 268).
export * from './registry-shared-location';
// S08 · PR 176/177 follow-up 372 — the couriers' own status calls (webhooks), off (registry-courier-webhooks.ts, version 269).
export * from './registry-courier-webhooks';
// S08 · PR 180 follow-up 437 — the courier's pick-up checked against each handed-over sheet, off (registry-handover-check.ts, version 275).
export * from './registry-handover-check';
// S13 · PR 282 — the marketing calendar: the switch and how many days one view shows (registry-marketing-calendar.ts, version 217).
export * from './registry-marketing-calendar';
// S13 · PR 283 — the marketing report: the switch, the longest period and a message send's result days (registry-marketing-report.ts, version 218).
export * from './registry-marketing-report';
// S02 · PR 76 — the page builder: the category page's sections, order, screens (registry-layouts.ts, version 240).
export * from './registry-layouts';
// S02 · PR 79 — the switch for editing the shop's words on the shop page (registry-front-edit.ts, version 242).
export * from './registry-front-edit';
// S02 · PR 600 — the on-page edit mode's switch, phone checks and phone sizes (registry-page-edit.ts, version 248).
export * from './registry-page-edit';
// S02 · PR 595 — the page layout builder's own sections and per-category layouts (registry-layout-blocks.ts, version 244).
export * from './registry-layout-blocks';
// S02 · PR 596 — the side canvas's switch and zones (registry-side-canvas.ts, version 245).
export * from './registry-side-canvas';
// S02 · PR 598 — the shimmers' speed and strength; the bag tier box's rules and words (registry-shimmer.ts, versions 246–247).
export * from './registry-shimmer';
// S02 · PR 83 — the A/B test module's switch and numbers (registry-experiments.ts, version 243).
export * from './registry-experiments';
// S02 · PR 80 — the eye-toggle list: every part of a shop page the owner can show or hide on its own (eye-toggles.ts).
export * from './eye-toggles';
// S18 · PR 383 — the placeholder guard for the owner's details the shop prints (placeholder.ts).
export * from './placeholder';
export { registry, localeSchema, timeZoneSchema, currencySchema, hostSchema, type Registry, type Key, type Value } from './registry';
