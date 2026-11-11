// S24 · PR 449 — FASHN AI (Blueprint C7.2/C7.17: "Try-On v1.6 for baseline, Try-On Max for premium", one of the two
// providers to benchmark). Verified against https://docs.fashn.ai at implementation time (11 Nov 2026, Blueprint
// C7.17's own instruction): base `https://api.fashn.ai`, a bearer key, job submission `POST /v1/run` and polling
// `GET /v1/status/{id}` — both wired by PR 450's estimate/generate/status/fetch, not yet by this one.
//
// FASHN publishes no account/credits endpoint (a completed job's response carries `credits_used` instead), so the
// cheapest real round trip that still proves the key — never a generation call, C7.19 — is asking the status of a
// request id that cannot exist: an authenticated key gets back "not found"; an invalid one gets FASHN's own
// `{"error": "UnauthorizedAccess"}` (or a 401/403).
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { emptyPhotoshootMockContext, mockPhotoshootProviderAdapter } from './mock';
import type { PhotoshootProviderApi, PhotoshootProviderCapabilities } from './contract';

export const FASHN_PROVIDER = 'fashn';
export const FASHN_DEFAULT_BASE_URL = 'https://api.fashn.ai';
// Well-formed, certain never to exist — only ever used to prove the key, never to touch a real job.
const HEALTH_PROBE_ID = '00000000-0000-0000-0000-000000000000';
const TIMEOUT_MS = 15_000;

export const fashnCapabilities: PhotoshootProviderCapabilities = { tryOn: true, ghostMannequin: false, premiumTier: true };

export const fashnConfig = z.object({
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(300).optional(),
  /** Try-On v1.6 (baseline) or Try-On Max (premium, up to 4K) — the owner's own choice, never hard-coded (PR 450 reads it). */
  tier: z.enum(['tryon-v1.6', 'tryon-max']).default('tryon-v1.6'),
});
export type FashnConfig = z.output<typeof fashnConfig>;

interface FashnErrorBody {
  error?: string | null;
  message?: string;
}

/** `GET /v1/status/{a well-formed id that cannot exist}` — "not found" means the key works; FASHN's own auth error means it does not. */
export function fashnHealth(apiKey: string, baseUrl: string = FASHN_DEFAULT_BASE_URL, doFetch: typeof fetch = fetch): () => Promise<{ ok: boolean; message: string }> {
  return async () => {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/v1/status/${HEALTH_PROBE_ID}`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: 'FASHN did not answer' };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'FASHN refused the key' };
    const body = (await res.json().catch(() => ({}))) as FashnErrorBody;
    if (body.error === 'UnauthorizedAccess') return { ok: false, message: 'FASHN refused the key' };
    return { ok: true, message: 'FASHN: the key is accepted' };
  };
}

export const fashnAdapter = defineAdapter<PhotoshootProviderApi, FashnConfig>({
  kind: 'AI_PROVIDER',
  provider: FASHN_PROVIDER,
  modes: ['LIVE'],
  secrets: ['apiKey'],
  configSchema: fashnConfig,
  async create(ctx) {
    const apiKey = await requireSecret(ctx, 'apiKey');
    const baseUrl = ctx.config.baseUrl ?? FASHN_DEFAULT_BASE_URL;
    return {
      provider: FASHN_PROVIDER,
      capabilities: { ...fashnCapabilities, premiumTier: ctx.config.tier === 'tryon-max' },
      health: fashnHealth(apiKey, baseUrl),
    };
  },
  async mock() {
    return mockPhotoshootProviderAdapter.mock(emptyPhotoshootMockContext);
  },
  async test(api) {
    return api.health();
  },
});
