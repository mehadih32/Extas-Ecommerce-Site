// S29 · PR 758–761 (CN-054) — the one place the lenses and the AI advisor read the setting of Reports › Geography map
// (`reports.geoMap`, PR 752, off as shipped): the page switch, the numbers the lenses use (`minOrders`, `warnReturnPct`,
// `topProducts`), which lens is on and the advisor's own switch. The setting itself is written by the lane that owns the
// screen; this file only reads it, and reads it defensively: a value that is missing or not in the expected shape counts
// as "off", never as a guess. Nothing here writes a setting.
import type { GeoLens, GeoMapSetting } from '@extas/metrics';
import type { AppResolver } from '../settings';

/** The lenses that read the shop's own records (the overview is the map itself). */
export type LensKey = Exclude<GeoLens, 'overview'>;
export const LENS_KEYS: readonly LensKey[] = ['courier', 'risk', 'money', 'demand'];

/** The setting as the lenses need it, or null when the map is off or the value is not usable. */
export interface LensSetting {
  minOrders: number;
  warnReturnPct: number;
  topProducts: number;
  lenses: Record<LensKey, boolean>;
  ai: boolean;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Reads a raw setting value as the lenses need it; null when the map is off or the shape is not the expected one. */
export function lensSettingOf(raw: unknown): LensSetting | null {
  if (!isObj(raw) || raw.on !== true) return null;
  const { minOrders, warnReturnPct, topProducts } = raw;
  if (!isNum(minOrders) || !isNum(warnReturnPct) || !isNum(topProducts)) return null;
  const l = isObj(raw.lenses) ? raw.lenses : {};
  const lenses = Object.fromEntries(LENS_KEYS.map((k) => [k, l[k] === true])) as Record<LensKey, boolean>;
  return { minOrders, warnReturnPct, topProducts, lenses, ai: raw.ai === true };
}

/** The setting of one store. The key is registered with the screen's lane (PR 752); until it is there this reads as off. */
export async function readLensSetting(resolver: AppResolver, storeId: number): Promise<LensSetting | null> {
  try {
    const read = resolver as unknown as { value: (key: string, at: { storeId: number }) => Promise<unknown> };
    return lensSettingOf(await read.value('reports.geoMap', { storeId }));
  } catch {
    return null;
  }
}

export type { GeoMapSetting };
