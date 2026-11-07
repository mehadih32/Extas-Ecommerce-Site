// The courier adapters (S08): the contract every courier answers (PR 175), the practice courier and its scripted
// worlds (PR 175), Steadfast (PR 176), Pathao (PR 177). Each courier is one adapter of kind COURIER answering `CourierApi`, listed in
// `courierAdapters` (and, once it has keys, in `allAdapters` and the Keys & connections catalogue).
import type { CourierCapabilities } from './contract';
import { MOCK_COURIER_PROVIDER, mockCourierAdapter, practiceCapabilities } from './practice';
import { PATHAO_PROVIDER, pathaoAdapter, pathaoCapabilities } from './pathao';
import { STEADFAST_PROVIDER, steadfastAdapter, steadfastCapabilities } from './steadfast';

export * from './contract';
export * from './mock';
export * from './practice';
export * from './mock-places';
export * from './steadfast';
export * from './pathao';
// follow-up 372: the couriers' own status calls (webhooks), read into the same events a poll gives
export * from './webhook';

/** Every courier adapter, for the shipping service's connection layer (each on its practice world until keyed). */
export const courierAdapters = [mockCourierAdapter, steadfastAdapter, pathaoAdapter] as const;

/** The courier adapters with keys: rows in Keys & connections (`allAdapters`). */
export const keyedCourierAdapters = [steadfastAdapter, pathaoAdapter] as const;

/** Follow-up 373: what a courier can do, by its provider key, without connecting to it (null: no such courier). */
export function courierCapabilitiesOf(provider: string): CourierCapabilities | null {
  const all: Record<string, CourierCapabilities> = { [MOCK_COURIER_PROVIDER]: practiceCapabilities, [STEADFAST_PROVIDER]: steadfastCapabilities, [PATHAO_PROVIDER]: pathaoCapabilities };
  return Object.hasOwn(all, provider) ? all[provider]! : null;
}
