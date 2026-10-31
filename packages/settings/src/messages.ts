// Labels and help texts of the settings, kept as {en, bn} pairs (Blueprint A7 / D11: admin in simple English with a
// Bengali switch). The registry only names a key; the text lives in messages/settings.<lang>.json, and the media
// settings (PR 22–25, 37) in messages/media.<lang>.json, the publish checklist settings (PR 21, 26, 29, 35) in
// messages/publish.<lang>.json and the size chart, collection, CSV and "was" price settings (PR 27, 28, 32, 34, 38) in
// messages/merch.<lang>.json, the link import, ghost archive and audit settings (PR 33, 36, 39) in
// messages/catalogue-tools.<lang>.json, the ERP and stock location settings (S09) in messages/inventory.<lang>.json,
// the Smart Rules and notice settings (S10) in messages/rules.<lang>.json, the combo settings (S03) in
// messages/combos.<lang>.json, the delivery-zone engine (S06, PR 549–555) in messages/delivery.<lang>.json and the
// storefront settings (S02, PR 82, 501, 503, 84, 40, 42) in messages/storefront.<lang>.json, the bag (S04, PR 105–114) in
// messages/bag.<lang>.json, the checkout (S04, PR 115–126) in messages/checkout.<lang>.json, the background worker
// (PR 6) in messages/jobs.<lang>.json and the third storefront batch (S02, PR 53, 67–71, 74, 75) in
// messages/shop-more.<lang>.json, storefront search (S02, PR 72, 73) in messages/search.<lang>.json, the storefront
// follow-ups (registry v25) in messages/storefront-fu.<lang>.json and the product page templates and Find My Size
// (S02, PR 50–52, 58) in messages/pdp-templates.<lang>.json and the customer accounts (S04, PR 129–137) in
// messages/accounts.<lang>.json and the combo storefront (S03, PR 91–95, 102, 103) in messages/combo-pages.<lang>.json,
// and the order core (S05, PR 138, 144, 145, 147, 153) in messages/orders.<lang>.json,
// and the admin shell (PR 12, 495; registry v33) in messages/admin-shell.<lang>.json, and the rest of the S04 checkout
// (PR 127, 128, 561, 563, 565, 605) in messages/checkout-more.<lang>.json, the Find My Size learning and the
// product reviews (S02, PR 59, 65; registry v35) in messages/reviews.<lang>.json, and "Build your own set" (S03, PR 98,
// 100; registry v36) in messages/set-builder.<lang>.json, and the support explanation panel and the bulk / corporate
// lane (S04, PR 566, 606; registry v38) in messages/support-lane.<lang>.json, and the Messages control centre (S05,
// PR 148, 149; registry v40, v41) in messages/messages.<lang>.json, and a number's history and the risk score (S06, PR 157,
// 156; registry v43) in messages/risk.<lang>.json, and the combo templates (S03, PR 572–574; registry v39) in
// messages/combo-templates.<lang>.json, the payments (S07, PR 165–170; registry v47) in messages/payments.<lang>.json,
// and courier shipping (S08, PR 175–177; registry v50) in messages/shipping.<lang>.json, and the wallet, refunds, advances
// and gateway statements (S07, PR 171–174; registry v55) in messages/money.<lang>.json, and Settings → Admin look (PR 12,
// CN-025, CN-026 (b); registry v51) in messages/admin-look.<lang>.json, the packing step (S08, PR 182, 183; registry v59)
// in messages/fulfilment.<lang>.json, and the customers (S14, PR 284–286; registry v60) in messages/customers.<lang>.json,
// merged in here.
import adminLookBn from '../messages/admin-look.bn.json';
import adminLookEn from '../messages/admin-look.en.json';
// and courier shipping (S08, PR 175–177; registry v50) in messages/shipping.<lang>.json, and exchanges, returns and
// refused parcels (S08, PR 185–191; registry v57) in messages/returns.<lang>.json, merged in here.
import adminShellBn from '../messages/admin-shell.bn.json';
import adminShellEn from '../messages/admin-shell.en.json';
import toolsBn from '../messages/catalogue-tools.bn.json';
import toolsEn from '../messages/catalogue-tools.en.json';
import deliveryBn from '../messages/delivery.bn.json';
import deliveryEn from '../messages/delivery.en.json';
import inventoryBn from '../messages/inventory.bn.json';
import inventoryEn from '../messages/inventory.en.json';
import mediaBn from '../messages/media.bn.json';
import mediaEn from '../messages/media.en.json';
import merchBn from '../messages/merch.bn.json';
import merchEn from '../messages/merch.en.json';
import publishBn from '../messages/publish.bn.json';
import publishEn from '../messages/publish.en.json';
import rulesBn from '../messages/rules.bn.json';
import rulesEn from '../messages/rules.en.json';
import combosBn from '../messages/combos.bn.json';
import combosEn from '../messages/combos.en.json';
import bagBn from '../messages/bag.bn.json';
import bagEn from '../messages/bag.en.json';
import checkoutBn from '../messages/checkout.bn.json';
import checkoutEn from '../messages/checkout.en.json';
import jobsBn from '../messages/jobs.bn.json';
import jobsEn from '../messages/jobs.en.json';
import storefrontBn from '../messages/storefront.bn.json';
import storefrontEn from '../messages/storefront.en.json';
import shopMoreBn from '../messages/shop-more.bn.json';
import shopMoreEn from '../messages/shop-more.en.json';
import searchBn from '../messages/search.bn.json';
import searchEn from '../messages/search.en.json';
import storefrontFuBn from '../messages/storefront-fu.bn.json';
import storefrontFuEn from '../messages/storefront-fu.en.json';
import pdpTemplatesBn from '../messages/pdp-templates.bn.json';
import pdpTemplatesEn from '../messages/pdp-templates.en.json';
import accountsBn from '../messages/accounts.bn.json';
import accountsEn from '../messages/accounts.en.json';
import riskBn from '../messages/risk.bn.json';
import riskEn from '../messages/risk.en.json';
import paymentsBn from '../messages/payments.bn.json';
import paymentsEn from '../messages/payments.en.json';
import comboPagesBn from '../messages/combo-pages.bn.json';
import comboPagesEn from '../messages/combo-pages.en.json';
import ordersBn from '../messages/orders.bn.json';
import ordersEn from '../messages/orders.en.json';
import checkoutMoreBn from '../messages/checkout-more.bn.json';
import checkoutMoreEn from '../messages/checkout-more.en.json';
import reviewsBn from '../messages/reviews.bn.json';
import reviewsEn from '../messages/reviews.en.json';
import setBuilderBn from '../messages/set-builder.bn.json';
import setBuilderEn from '../messages/set-builder.en.json';
import supportLaneBn from '../messages/support-lane.bn.json';
import supportLaneEn from '../messages/support-lane.en.json';
import messagesBn from '../messages/messages.bn.json';
import messagesEn from '../messages/messages.en.json';
import comboTplBn from '../messages/combo-templates.bn.json';
import comboTplEn from '../messages/combo-templates.en.json';
import shippingBn from '../messages/shipping.bn.json';
import shippingEn from '../messages/shipping.en.json';
import moneyBn from '../messages/money.bn.json';
import fulfilmentBn from '../messages/fulfilment.bn.json';
import fulfilmentEn from '../messages/fulfilment.en.json';
import moneyEn from '../messages/money.en.json';
import courierSyncBn from '../messages/courier-sync.bn.json';
import courierSyncEn from '../messages/courier-sync.en.json';
import returnsBn from '../messages/returns.bn.json';
import returnsEn from '../messages/returns.en.json';
import customersBn from '../messages/customers.bn.json';
import customersEn from '../messages/customers.en.json';
import seoBn from '../messages/seo.bn.json';
import seoEn from '../messages/seo.en.json';
// PR 407 (S20; registry v63): the printed invoice, its chat picture and issuing, in messages/invoice.<lang>.json.
import invoiceBn from '../messages/invoice.bn.json';
import invoiceEn from '../messages/invoice.en.json';
// PR 425 (S22; registry v63): the support inbox, files in a conversation and customer numbers, in messages/support.<lang>.json.
import supportBn from '../messages/support.bn.json';
import supportEn from '../messages/support.en.json';
import bn from '../messages/settings.bn.json';
import en from '../messages/settings.en.json';

// CN-028 · PR 607–618 (registry v62): the ERP contract v6, its event pulls, every setting of RETAIL-ERP-MODEL §11
// (hold, summary, fixed costs, books, exchange, hand-back, B grade, price floor) in messages/erp-v6.<lang>.json, merged below.
import erpV6Bn from '../messages/erp-v6.bn.json';
import erpV6En from '../messages/erp-v6.en.json';
import erpOrdersV6Bn from '../messages/erp-orders-v6.bn.json';
import erpOrdersV6En from '../messages/erp-orders-v6.en.json';
// CN-028 · PR 615, 616 (registry v68): the ERP account ledger and the books match in messages/books.<lang>.json.
import booksBn from '../messages/books.bn.json';
import booksEn from '../messages/books.en.json';
// CN-028 · PR 612–614 (registry v67): returns and exchanges on the ERP model in messages/returns-v6.<lang>.json, merged below.
import returnsV6Bn from '../messages/returns-v6.bn.json';
import returnsV6En from '../messages/returns-v6.en.json';
import bhandariP1Bn from '../messages/bhandari-p1.bn.json';
import bhandariP1En from '../messages/bhandari-p1.en.json';
// CN-028 · PR 617, 618 (registry v69): the summary and fixed-cost jobs, the cost lines a store never has, the Books card.
import booksSummaryBn from '../messages/books-summary.bn.json';
import booksSummaryEn from '../messages/books-summary.en.json';
// CN-028 · PR 619, 621 (registry v70): the switch-over, the ERP link page and the acceptance suite.
import switchoverBn from '../messages/switchover.bn.json';
import switchoverEn from '../messages/switchover.en.json';
// S18 · PR 378 (registry v73): the page protection policy and the per-address request limits.
import webSecurityBn from '../messages/web-security.bn.json';
import webSecurityEn from '../messages/web-security.en.json';
// S18 · PR 379 (registry v74): the quiet bot check on sign-in and checkout.
import botCheckBn from '../messages/bot-check.bn.json';
import botCheckEn from '../messages/bot-check.en.json';
// S18 · PR 380 (registry v78): the admin address list and the new-login notes.
import adminAccessBn from '../messages/admin-access.bn.json';
import adminAccessEn from '../messages/admin-access.en.json';
// S19 · PR 395, 507 — the backups (registry v75–76).
import backupsBn from '../messages/backups.bn.json';
import backupsEn from '../messages/backups.en.json';
import privacyBn from '../messages/privacy.bn.json';
import privacyEn from '../messages/privacy.en.json';
import edgeBn from '../messages/edge.bn.json';
import edgeEn from '../messages/edge.en.json';
import healthBn from '../messages/health.bn.json';
import healthEn from '../messages/health.en.json';
// S16 · PR 343 — the cost ledger (registry v77).
import costsBn from '../messages/costs.bn.json';
import courierReportBn from '../messages/courier-report.bn.json';
import courierReportEn from '../messages/courier-report.en.json';
import costsEn from '../messages/costs.en.json';
import bengaliGateBn from '../messages/bengali-gate.bn.json';
import bengaliGateEn from '../messages/bengali-gate.en.json';
import trackingBn from '../messages/tracking.bn.json';
// S08 · PR 193 — holiday mode (registry v94).
import holidayBn from '../messages/holiday.bn.json';
import holidayEn from '../messages/holiday.en.json';
// S08 · PR 564 — the charge mismatch log (registry v95).
import chargeMismatchBn from '../messages/charge-mismatch.bn.json';
import chargeMismatchEn from '../messages/charge-mismatch.en.json';
// SIM-F-048 · PR 179 follow-up — the sticker's Latin address line (registry v96).
import stickerLatinBn from '../messages/sticker-latin.bn.json';
import stickerLatinEn from '../messages/sticker-latin.en.json';
// SIM-F-048 · PR 550 follow-up — the delivery promise per district (registry v97).
import districtPromiseBn from '../messages/district-promise.bn.json';
import districtPromiseEn from '../messages/district-promise.en.json';
// CN-018 (4) · PR 89 follow-up — sets Fixed or Flexible (registry v98).
import comboSplitBn from '../messages/combo-split.bn.json';
import comboSplitEn from '../messages/combo-split.en.json';
// CN-020 (3) — "Call me" at checkout (registry v99).
import callMeBn from '../messages/call-me.bn.json';
import callMeEn from '../messages/call-me.en.json';
import voiceAddressBn from '../messages/voice-address.bn.json';
import voiceAddressEn from '../messages/voice-address.en.json';
import trackingEn from '../messages/tracking.en.json';

export type MessageTree = { [key: string]: string | MessageTree };
export interface SettingsMessages {
  en: MessageTree;
  bn: MessageTree;
}

/** Deep merge of message trees; a key defined twice is a mistake and throws. */
export function mergeMessages(a: MessageTree, b: MessageTree, at = ''): MessageTree {
  const out: MessageTree = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    if (prev === undefined) out[k] = v;
    else if (typeof prev === 'object' && typeof v === 'object') out[k] = mergeMessages(prev, v, `${at}${k}.`);
    else throw new Error(`settings message "${at}${k}" is defined twice`);
  }
  return out;
}

export const messages: SettingsMessages = {
  en: mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(en, mediaEn), publishEn), merchEn), toolsEn), inventoryEn), rulesEn), combosEn), deliveryEn), storefrontEn), bagEn), checkoutEn), jobsEn), shopMoreEn), searchEn), storefrontFuEn), pdpTemplatesEn), accountsEn), comboPagesEn), ordersEn), adminShellEn), checkoutMoreEn), reviewsEn), setBuilderEn), supportLaneEn), messagesEn), riskEn), comboTplEn), paymentsEn), shippingEn), moneyEn), adminLookEn), courierSyncEn), returnsEn), fulfilmentEn), customersEn), seoEn),
  bn: mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(bn, mediaBn), publishBn), merchBn), toolsBn), inventoryBn), rulesBn), combosBn), deliveryBn), storefrontBn), bagBn), checkoutBn), jobsBn), shopMoreBn), searchBn), storefrontFuBn), pdpTemplatesBn), accountsBn), comboPagesBn), ordersBn), adminShellBn), checkoutMoreBn), reviewsBn), setBuilderBn), supportLaneBn), messagesBn), riskBn), comboTplBn), paymentsBn), shippingBn), moneyBn), adminLookBn), courierSyncBn), returnsBn), fulfilmentBn), customersBn), seoBn),
};

messages.en = mergeMessages(messages.en, erpV6En);
messages.bn = mergeMessages(messages.bn, erpV6Bn);
messages.en = mergeMessages(messages.en, invoiceEn);
messages.bn = mergeMessages(messages.bn, invoiceBn);
messages.en = mergeMessages(messages.en, supportEn);
messages.bn = mergeMessages(messages.bn, supportBn);
// CN-028 · PR 610, 611 (registry v66): orders to the ERP v6, in messages/erp-orders-v6.<lang>.json.
messages.en = mergeMessages(messages.en, erpOrdersV6En);
messages.bn = mergeMessages(messages.bn, erpOrdersV6Bn);
messages.en = mergeMessages(messages.en, booksEn);
messages.bn = mergeMessages(messages.bn, booksBn);
messages.en = mergeMessages(messages.en, returnsV6En);
messages.bn = mergeMessages(messages.bn, returnsV6Bn);
// CN-029 Phase 1 · PR 609, 620 (registry v65): messages/bhandari-p1.<lang>.json.
messages.en = mergeMessages(messages.en, bhandariP1En);
messages.bn = mergeMessages(messages.bn, bhandariP1Bn);
messages.en = mergeMessages(messages.en, booksSummaryEn);
messages.bn = mergeMessages(messages.bn, booksSummaryBn);
messages.en = mergeMessages(messages.en, switchoverEn);
messages.bn = mergeMessages(messages.bn, switchoverBn);
messages.en = mergeMessages(messages.en, webSecurityEn);
messages.bn = mergeMessages(messages.bn, webSecurityBn);
messages.en = mergeMessages(messages.en, botCheckEn);
messages.bn = mergeMessages(messages.bn, botCheckBn);
messages.en = mergeMessages(messages.en, adminAccessEn);
messages.bn = mergeMessages(messages.bn, adminAccessBn);
messages.en = mergeMessages(messages.en, backupsEn);
messages.bn = mergeMessages(messages.bn, backupsBn);
messages.en = mergeMessages(messages.en, privacyEn);
messages.bn = mergeMessages(messages.bn, privacyBn);
// S18 · PR 386 — the shop's protection at Cloudflare (registry-edge.ts).
messages.en = mergeMessages(messages.en, edgeEn);
messages.bn = mergeMessages(messages.bn, edgeBn);
// S21 · PR 413 — the Site health hub's limits (registry-health.ts).
messages.en = mergeMessages(messages.en, healthEn);
messages.bn = mergeMessages(messages.bn, healthBn);
messages.en = mergeMessages(messages.en, costsEn);
messages.bn = mergeMessages(messages.bn, costsBn);
// PR 192 (registry v93): the RTO cost book switch, courier claims, Support › Rider issues.
messages.en = mergeMessages(messages.en, courierReportEn);
messages.bn = mergeMessages(messages.bn, courierReportBn);
// S11 · PR 588 — the Bengali translation gate (registry-bengali.ts).
messages.en = mergeMessages(messages.en, bengaliGateEn);
messages.bn = mergeMessages(messages.bn, bengaliGateBn);
// S13 · PR 257 — server-side event tracking (registry-tracking.ts).
messages.en = mergeMessages(messages.en, trackingEn);
messages.bn = mergeMessages(messages.bn, trackingBn);
// S08 · PR 193 (registry v94): holiday mode.
messages.en = mergeMessages(messages.en, holidayEn);
messages.bn = mergeMessages(messages.bn, holidayBn);
// S08 · PR 564 (registry v95): the charge mismatch log.
messages.en = mergeMessages(messages.en, chargeMismatchEn);
messages.bn = mergeMessages(messages.bn, chargeMismatchBn);
// SIM-F-048 · PR 179 follow-up (registry v96): the sticker's Latin address line.
messages.en = mergeMessages(messages.en, stickerLatinEn);
messages.bn = mergeMessages(messages.bn, stickerLatinBn);
// SIM-F-048 · PR 550 follow-up (registry v97): the delivery promise per district.
messages.en = mergeMessages(messages.en, districtPromiseEn);
messages.bn = mergeMessages(messages.bn, districtPromiseBn);
// CN-018 (4) · PR 89 follow-up (registry v98): sets Fixed or Flexible.
messages.en = mergeMessages(messages.en, comboSplitEn);
messages.bn = mergeMessages(messages.bn, comboSplitBn);
// CN-020 (3) (registry v99): "Call me" at checkout.
messages.en = mergeMessages(messages.en, callMeEn);
messages.bn = mergeMessages(messages.bn, callMeBn);
messages.en = mergeMessages(messages.en, voiceAddressEn);
messages.bn = mergeMessages(messages.bn, voiceAddressBn);

/** The string at a dotted key, or undefined when it is missing (a gap stays visible to the caller). */
export function lookup(tree: MessageTree, key: string): string | undefined {
  let node: string | MessageTree | undefined = tree;
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

export interface LabelPair {
  en: string;
  bn: string;
}

/** Both languages of one key; throws when either is missing, so a sync never writes an empty label. */
export function pair(msgs: SettingsMessages, key: string): LabelPair {
  const e = lookup(msgs.en, key);
  const b = lookup(msgs.bn, key);
  if (e === undefined || b === undefined) {
    throw new Error(`settings message "${key}" is missing in ${e === undefined ? 'en' : 'bn'}`);
  }
  return { en: e, bn: b };
}
