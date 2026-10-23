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
// messages/accounts.<lang>.json, merged in here.
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
import bn from '../messages/settings.bn.json';
import en from '../messages/settings.en.json';

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
  en: mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(en, mediaEn), publishEn), merchEn), toolsEn), inventoryEn), rulesEn), combosEn), deliveryEn), storefrontEn), bagEn), checkoutEn), jobsEn), shopMoreEn), searchEn), storefrontFuEn), pdpTemplatesEn), accountsEn),
  bn: mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(bn, mediaBn), publishBn), merchBn), toolsBn), inventoryBn), rulesBn), combosBn), deliveryBn), storefrontBn), bagBn), checkoutBn), jobsBn), shopMoreBn), searchBn), storefrontFuBn), pdpTemplatesBn), accountsBn),
};

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
