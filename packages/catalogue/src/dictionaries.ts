// The owner-editable dictionaries of the catalogue (settings `catalogue.colourFamilies`, `catalogue.fibres`,
// `catalogue.fabricConstructions`, `catalogue.careInstructions`, `catalogue.fabricFeatures`): rows keep only the keys,
// the text comes from the dictionary in the language asked for.
import type { Dictionary } from '@extas/settings';
import { CatalogueError } from './errors';

export type Lang = 'en' | 'bn';

/** The text of a key, or the key itself when the dictionary no longer has it (a removed entry stays readable). */
export function label(dict: Dictionary, key: string, lang: Lang): string {
  const e = dict.find((d) => d.key === key);
  return e ? e[lang] : key;
}

/** Throws UNKNOWN_KEY naming every key that is not in the dictionary. */
export function assertKeys(dict: Dictionary, keys: readonly string[], field: string): void {
  const known = new Set(dict.map((d) => d.key));
  const bad = keys.filter((k) => !known.has(k));
  if (bad.length) throw new CatalogueError('UNKNOWN_KEY', `not in the ${field} dictionary`, bad.map((k) => `${field}: ${k}`));
}
