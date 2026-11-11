// S24 · PR 449 — Fitroom (Blueprint C7.17's "other specialist flat-lay-to-model services exist (Claid, uwear.ai,
// Pixelcut, Fitroom and others)"), the second provider to benchmark against FASHN. Verified against
// https://developer.fitroom.app at implementation time (11 Nov 2026, Blueprint C7.17's own instruction): base
// `https://platform.fitroom.app`, the key in an `X-API-KEY` header, job submission `POST /api/tryon/v2/tasks` and
// polling `GET /api/tryon/v2/tasks/:id` — both wired by PR 450's estimate/generate/status/fetch, not yet by this
// one.
//
// Fitroom publishes no account/credits endpoint either (a 402 on a real job means insufficient credit), so the same
// "ask for a task id that cannot exist" health check applies: an authenticated key gets back "not found"; an
// invalid one is refused outright (401/403) — never a generation call, C7.19.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { emptyPhotoshootMockContext, mockPhotoshootProviderAdapter } from './mock';
import type { PhotoshootProviderApi, PhotoshootProviderCapabilities } from './contract';

export const FITROOM_PROVIDER = 'fitroom';
export const FITROOM_DEFAULT_BASE_URL = 'https://platform.fitroom.app';
// Well-formed, certain never to exist — only ever used to prove the key, never to touch a real job.
const HEALTH_PROBE_ID = '00000000-0000-0000-0000-000000000000';
const TIMEOUT_MS = 15_000;

export const fitroomCapabilities: PhotoshootProviderCapabilities = { tryOn: true, ghostMannequin: false, premiumTier: false };

export const fitroomConfig = z.object({
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(300).optional(),
});
export type FitroomConfig = z.output<typeof fitroomConfig>;

/** `GET /api/tryon/v2/tasks/{a well-formed id that cannot exist}` — "not found" means the key works. */
export function fitroomHealth(apiKey: string, baseUrl: string = FITROOM_DEFAULT_BASE_URL, doFetch: typeof fetch = fetch): () => Promise<{ ok: boolean; message: string }> {
  return async () => {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/api/tryon/v2/tasks/${HEALTH_PROBE_ID}`, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: 'Fitroom did not answer' };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'Fitroom refused the key' };
    return { ok: true, message: 'Fitroom: the key is accepted' };
  };
}

export const fitroomAdapter = defineAdapter<PhotoshootProviderApi, FitroomConfig>({
  kind: 'AI_PROVIDER',
  provider: FITROOM_PROVIDER,
  modes: ['LIVE'],
  secrets: ['apiKey'],
  configSchema: fitroomConfig,
  async create(ctx) {
    const apiKey = await requireSecret(ctx, 'apiKey');
    const baseUrl = ctx.config.baseUrl ?? FITROOM_DEFAULT_BASE_URL;
    return {
      provider: FITROOM_PROVIDER,
      capabilities: fitroomCapabilities,
      health: fitroomHealth(apiKey, baseUrl),
    };
  },
  async mock() {
    return mockPhotoshootProviderAdapter.mock(emptyPhotoshootMockContext);
  },
  async test(api) {
    return api.health();
  },
});
