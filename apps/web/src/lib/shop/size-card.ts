// Follow-up 144 (PR 131, with PR 58) — the "Your size" card in My account › For you (demo 60-account.js acc_sizeCard):
// the size Find My Size gives this phone's kept height and weight (the `extas_fit` cookie, as the product page and the
// size guide window keep it) on the shop's first top chart and first bottom chart the finder can answer from
// (lib/shop/size-guide), with the height and the weight. Nothing kept yet: the card says so and offers "Find my size".
// Pure: the account page reads the cookie and the guide, this works out the card.
import { recommendSize } from '@extas/catalogue/size-finder';
import type { PdpFinderSettings } from '@extas/settings';
import { feetInches, finderChart, finderRules, readFit } from './pdp-finder';
import type { GuideEntry } from './size-guide';

export interface SizeCard {
  /** null: nothing kept on this phone yet. */
  kept: { top: string | null; bottom: string | null; ft: number; inch: number; kg: number } | null;
}

/** The card, or null when it has nothing to offer (Find My Size off or not kept on the phone, or no chart it reads). */
export function sizeCard(cookie: string | null | undefined, finder: PdpFinderSettings, entries: readonly GuideEntry[]): SizeCard | null {
  if (!finder.on || !finder.remember) return null;
  const usable = entries.filter((e) => e.finds);
  if (!usable.length) return null;
  const body = readFit(cookie, finder);
  if (!body) return { kept: null };
  const rules = finderRules(finder);
  const size = (e: GuideEntry | undefined) => {
    const rec = e ? recommendSize(finderChart(e.chart), body.heightIn, body.weightKg, rules, e.garment) : null;
    return rec && e ? (e.labels[rec.size] ?? rec.size) : null;
  };
  const { ft, inch } = feetInches(body.heightIn);
  return { kept: { top: size(usable.find((e) => !e.bottom)), bottom: size(usable.find((e) => e.bottom)), ft, inch, kg: body.weightKg } };
}
