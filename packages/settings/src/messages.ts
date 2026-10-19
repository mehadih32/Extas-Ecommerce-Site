// Labels and help texts of the settings, kept as {en, bn} pairs (Blueprint A7 / D11: admin in simple English with a
// Bengali switch). The registry only names a key; the text lives in messages/settings.<lang>.json.
import bn from '../messages/settings.bn.json';
import en from '../messages/settings.en.json';

export type MessageTree = { [key: string]: string | MessageTree };
export interface SettingsMessages {
  en: MessageTree;
  bn: MessageTree;
}

export const messages: SettingsMessages = { en, bn };

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
