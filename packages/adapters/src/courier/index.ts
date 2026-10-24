// The courier adapters (S08): the contract every courier answers (PR 175), the practice courier and its scripted
// worlds (PR 175), Steadfast (PR 176), Pathao (PR 177). Each courier is one adapter of kind COURIER answering `CourierApi`, listed in
// `courierAdapters` (and, once it has keys, in `allAdapters` and the Keys & connections catalogue).
import { mockCourierAdapter } from './practice';
import { pathaoAdapter } from './pathao';
import { steadfastAdapter } from './steadfast';

export * from './contract';
export * from './mock';
export * from './practice';
export * from './steadfast';
export * from './pathao';

/** Every courier adapter, for the shipping service's connection layer (each on its practice world until keyed). */
export const courierAdapters = [mockCourierAdapter, steadfastAdapter, pathaoAdapter] as const;

/** The courier adapters with keys: rows in Keys & connections (`allAdapters`). */
export const keyedCourierAdapters = [steadfastAdapter, pathaoAdapter] as const;
