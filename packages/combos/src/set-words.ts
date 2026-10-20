// PR 101, 96 — the words of a set on the shop, from messages/set.<lang>.json (no text is written here): the line for
// each thing still missing, and the one button wording "Add both to bag · ৳1,800" (Blueprint D8.1). Words and price
// are one decision: the button's price is always the set price the check and the bag use, passed in already formatted.
import bn from '../messages/set.bn.json';
import en from '../messages/set.en.json';
import type { SetProblem } from './validate';

export type SetLang = 'en' | 'bn';
export const SET_WORDS = { en, bn } as const;

/** `{token}` filled from vars; an unknown token stays visible (a test catches it). */
export function fillWords(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** "item 2 (Pique Polo)". */
export const itemWords = (lang: SetLang, n: number, name: string) => fillWords(SET_WORDS[lang].item, { n, name });

/** The line for one problem; `names` are the piece's name and the colour and size picked, in the customer's language. */
export function problemWords(lang: SetLang, p: SetProblem, names: { item: string; colour?: string; size?: string }, num: (n: number) => string = String): string {
  const w = SET_WORDS[lang].problem;
  const key = p.code === 'NOT_ENOUGH' && (p.inBag ?? 0) > 0 ? 'NOT_ENOUGH_BAG' : p.code;
  return fillWords(w[key], { item: names.item, colour: names.colour ?? '', size: names.size ?? '', stock: num(p.stock ?? 0), need: num(p.need ?? 0), inBag: num(p.inBag ?? 0) });
}

/** The add button: "Add both to bag · ৳1,800" for two pieces, "Add all 3 to bag · ৳2,400" for more. */
export function addWords(lang: SetLang, pieces: number, price: string, num: (n: number) => string = String): string {
  const c = SET_WORDS[lang].cta;
  return pieces === 2 ? fillWords(c.two, { price }) : fillWords(c.many, { n: num(pieces), price });
}
