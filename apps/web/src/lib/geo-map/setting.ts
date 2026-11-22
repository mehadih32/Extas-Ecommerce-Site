// S29 · PR 758–761 (CN-054) — the one place the lenses and the AI advisor read the numbers of Reports › Geography map
// (`reports.geoMap`, PR 752): `minOrders`, `warnReturnPct` and `topProducts`. There is no on/off switch (owner's decision,
// 16 Nov 2026): a value that is missing, or not in the expected shape (an older stored value may still carry the retired
// `on`, `slices`, `lenses` and `ai` keys, which are never read), falls back to the shipped numbers. Nothing here writes a setting.
import type { GeoLens, GeoMapSetting } from "@extas/metrics";
import { GEO_MAP_DEFAULT } from "@extas/settings";
import type { AppResolver } from "../settings";

/** The lenses that read the shop's own records (the overview is the map itself). */
export type LensKey = Exclude<GeoLens, 'overview'>;
export const LENS_KEYS: readonly LensKey[] = ['courier', 'risk', 'money', 'demand'];

/** The numbers the lenses need. */
export interface LensSetting {
  minOrders: number;
  warnReturnPct: number;
  topProducts: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Reads a raw setting value as the lenses need it; a number that is not usable is the shipped number. */
export function lensSettingOf(raw: unknown): LensSetting {
  const o = isObj(raw) ? raw : {};
  return {
    minOrders: isNum(o.minOrders) ? o.minOrders : GEO_MAP_DEFAULT.minOrders,
    warnReturnPct: isNum(o.warnReturnPct)
      ? o.warnReturnPct
      : GEO_MAP_DEFAULT.warnReturnPct,
    topProducts: isNum(o.topProducts)
      ? o.topProducts
      : GEO_MAP_DEFAULT.topProducts,
  };
}

/** The setting of one store; unreadable counts as the shipped numbers. */
export async function readLensSetting(
  resolver: AppResolver,
  storeId: number,
): Promise<LensSetting> {
  try {
    const read = resolver as unknown as { value: (key: string, at: { storeId: number }) => Promise<unknown> };
    return lensSettingOf(await read.value('reports.geoMap', { storeId }));
  } catch {
    return lensSettingOf(null);
  }
}

export type { GeoMapSetting };
