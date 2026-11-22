// S29 · PR 753–761 (CN-054) — the words the Geography map screen builds its labels from, in the shown language: the click panel
// and compare bar, the slices, the courier lens and the other lenses with the advisor. The screen is a client component, so it
// takes the dictionaries from here (messages/admin-geo-*.{en,bn}.json) instead of getting label functions from the server.
import type { Dict } from "../i18n";
import lensBn from "../../../messages/admin-geo-lens.bn.json";
import lensEn from "../../../messages/admin-geo-lens.en.json";
import lensesBn from "../../../messages/admin-geo-lenses.bn.json";
import lensesEn from "../../../messages/admin-geo-lenses.en.json";
import panelBn from "../../../messages/admin-geo-panel.bn.json";
import panelEn from "../../../messages/admin-geo-panel.en.json";
import slicesBn from "../../../messages/admin-geo-slices.bn.json";
import slicesEn from "../../../messages/admin-geo-slices.en.json";

/** One dictionary holding `geoPanel`, `geoSlices`, `geoLens` and `geoLenses` (English by default, Bengali with the toggle). */
export function geoDict(lang: "en" | "bn"): Dict {
  const b = lang === "bn";
  return {
    geoPanel: (b ? panelBn : panelEn).geoPanel as unknown as Dict,
    geoSlices: (b ? slicesBn : slicesEn).geoSlices as unknown as Dict,
    geoLens: (b ? lensBn : lensEn).geoLens as unknown as Dict,
    geoLenses: (b ? lensesBn : lensesEn).geoLenses as unknown as Dict,
  };
}
