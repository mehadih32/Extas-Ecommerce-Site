// S24 · PR 449 — the practice photoshoot provider: every job runs here until a real provider's key is entered and
// its Test passes (A1.3). It answers `health()` only for now; PR 450 adds the mock's job methods (estimate,
// generate, status, fetch) alongside the live providers'.
import { z } from 'zod';
import { AdapterError, defineAdapter, type AdapterContext } from '../define';
import type { PhotoshootProviderApi, PhotoshootProviderCapabilities } from './contract';

export const MOCK_PHOTOSHOOT_PROVIDER = 'mockPhotoshoot';

/** The mock takes no settings; every live provider's `mock()` passes this when it falls back to practice. */
export const emptyPhotoshootMockContext: AdapterContext<Record<string, never>> = { mode: 'MOCK', config: {}, storeId: null, async secret() { return null; } };

export const mockPhotoshootCapabilities: PhotoshootProviderCapabilities = { tryOn: true, ghostMannequin: true, premiumTier: false };

export const mockPhotoshootProviderAdapter = defineAdapter<PhotoshootProviderApi, Record<string, never>>({
  kind: 'AI_PROVIDER',
  provider: MOCK_PHOTOSHOOT_PROVIDER,
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no photoshoot provider is connected yet; the practice provider serves until a key is entered');
  },
  async mock() {
    return {
      provider: MOCK_PHOTOSHOOT_PROVIDER,
      capabilities: mockPhotoshootCapabilities,
      async health() {
        return { ok: true, message: 'practice photoshoot provider: nothing leaves the server' };
      },
    };
  },
  async test(api) {
    return api.health();
  },
});
