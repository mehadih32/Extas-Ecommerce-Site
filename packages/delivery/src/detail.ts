// PR 563 (SIM-F-030) — does a typed address say where in the place the house is? A district or a postcode settles the
// band (PR 551), but "bazar er pashe, Kurigram" gives the rider no house, road, para or village to find. The check is
// the owner's word list (`checkout.address.check`), compared with the gazetteer's own normal form and spelling fold,
// whole words only ("gram" is not "Kurigram"), and a word followed straight by a number ("h12", "rd5") counts too.
// It only ever adds a flag and a call; it never holds or refuses an order.
import { fold, normalize, words } from './text';

/** The folded keys of the owner's words (one entry may be two words: "flat no"). */
export function detailKeys(list: readonly string[]): string[][] {
  return list.map((w) => normalize(w).split(' ').filter(Boolean).map(fold)).filter((k) => k.length > 0);
}

/** True when the line names a house, a road, a para, a village … (one of the owner's words). An empty list: true. */
export function hasAddressDetail(line: string, list: readonly string[]): boolean {
  const keys = detailKeys(list);
  if (!keys.length) return true;
  const toks = words(line).map(fold);
  const single = new Set(keys.filter((k) => k.length === 1).map((k) => k[0]!));
  for (const t of toks) {
    if (single.has(t)) return true;
    const head = /^(\D+)\d+$/.exec(t)?.[1];
    if (head && single.has(head)) return true;
  }
  return keys.filter((k) => k.length > 1).some((k) => toks.some((_, i) => k.every((x, j) => toks[i + j] === x)));
}
