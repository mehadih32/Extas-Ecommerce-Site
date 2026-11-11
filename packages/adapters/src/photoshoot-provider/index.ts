// S24 · PR 449/450 (Blueprint C7.17) — the photoshoot provider adapters: the practice provider, FASHN AI, Fitroom.
// Each is one adapter of kind AI_PROVIDER answering `PhotoshootProviderApi` (contract.ts), listed here and, once
// keyed, in `allAdapters` and the Keys & connections catalogue. PR 449 wired `health()` (the Test button); PR 450
// adds the job methods every one of them now answers — estimate, generate, status, fetch — for `@extas/photoshoot`'s
// job orchestration (PR 451–452) to call.
import type { PhotoshootProviderCapabilities } from './contract';
import { MOCK_PHOTOSHOOT_PROVIDER, mockPhotoshootCapabilities, mockPhotoshootProviderAdapter } from './mock';
import { FASHN_PROVIDER, fashnAdapter, fashnCapabilities } from './fashn';
import { FITROOM_PROVIDER, fitroomAdapter, fitroomCapabilities } from './fitroom';

export * from './contract';
export * from './mock';
export * from './fashn';
export * from './fitroom';

/** Every photoshoot provider adapter, for the studio's connection layer (each on its practice provider until keyed). */
export const photoshootProviderAdapters = [mockPhotoshootProviderAdapter, fashnAdapter, fitroomAdapter] as const;

/** The photoshoot provider adapters with keys: rows in Keys & connections (`allAdapters`). */
export const keyedPhotoshootProviderAdapters = [fashnAdapter, fitroomAdapter] as const;

/** What a provider can do, by its provider key, without connecting to it (null: no such provider). */
export function photoshootProviderCapabilitiesOf(provider: string): PhotoshootProviderCapabilities | null {
  const all: Record<string, PhotoshootProviderCapabilities> = {
    [MOCK_PHOTOSHOOT_PROVIDER]: mockPhotoshootCapabilities,
    [FASHN_PROVIDER]: fashnCapabilities,
    [FITROOM_PROVIDER]: fitroomCapabilities,
  };
  return Object.hasOwn(all, provider) ? all[provider]! : null;
}
