// Labels and help texts of the settings, kept as {en, bn} pairs (Blueprint A7 / D11: admin in simple English with a
// Bengali switch). The registry only names a key; the text lives in messages/settings.<lang>.json, and the media
// settings (PR 22–25, 37) in messages/media.<lang>.json, the publish checklist settings (PR 21, 26, 29, 35) in
// messages/publish.<lang>.json and the size chart, collection, CSV and "was" price settings (PR 27, 28, 32, 34, 38) in
// messages/merch.<lang>.json, the link import, ghost archive and audit settings (PR 33, 36, 39) in
// messages/catalogue-tools.<lang>.json, the ERP and stock location settings (S09) in messages/inventory.<lang>.json,
// the Smart Rules and notice settings (S10) in messages/rules.<lang>.json, the combo settings (S03) in
// messages/combos.<lang>.json and the delivery-zone engine (S06, PR 549–555) in messages/delivery.<lang>.json, merged in here.
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
  en: mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(en, mediaEn), publishEn), merchEn), toolsEn), inventoryEn), rulesEn), combosEn), deliveryEn),
  bn: mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(mergeMessages(bn, mediaBn), publishBn), merchBn), toolsBn), inventoryBn), rulesBn), combosBn), deliveryBn),
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
