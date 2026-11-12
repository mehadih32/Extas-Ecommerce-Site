// S24 · PR 449/450 — FASHN AI (Blueprint C7.2/C7.17: "Try-On v1.6 for baseline, Try-On Max for premium", one of the
// two providers to benchmark). Verified against https://docs.fashn.ai at implementation time (11 Nov 2026, Blueprint
// C7.17's own instruction): base `https://api.fashn.ai`, a bearer key, job submission `POST /v1/run` with body
// `{ model_name, inputs: { model_image, garment_image, category, seed, num_samples, ... } }`, returning `{ id,
// error }`; polling `GET /v1/status/{id}` returning `{ id, status, output, error }` with `status` one of `starting
// | in_queue | processing | completed | failed` and, on failure, `error: { name, message }`; a completed job's own
// spend comes back in the `x-fashn-credits-used` response header, never in the body (docs.fashn.ai/api-overview/
// api-fundamentals).
//
// FASHN publishes no account/credits endpoint (a completed job's response carries that header instead), so the
// cheapest real round trip that still proves the key — never a generation call, C7.19 — is asking the status of a
// request id that cannot exist: an authenticated key gets back "not found"; an invalid one gets FASHN's own
// `{"error": "UnauthorizedAccess"}` (or a 401/403).
import { z } from 'zod';
import { AdapterError, defineAdapter, requireSecret } from '../define';
import { emptyPhotoshootMockContext, mockPhotoshootProviderAdapter } from './mock';
import {
  photoshootEstimateFromRate,
  requirePhotoshootJobSupported,
  type PhotoshootEstimateInput,
  type PhotoshootFetchResult,
  type PhotoshootGarmentCategory,
  type PhotoshootGenerateInput,
  type PhotoshootGenerateResult,
  type PhotoshootJobState,
  type PhotoshootProviderApi,
  type PhotoshootProviderCapabilities,
  type PhotoshootStatusResult,
} from './contract';

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

interface FashnRunResponse {
  id?: string;
  error?: string | null;
}

interface FashnStatusResponse {
  id?: string;
  status?: string;
  output?: string[] | null;
  error?: { name?: string; message?: string } | null;
}

const FASHN_CATEGORY: Record<PhotoshootGarmentCategory, 'auto' | 'tops' | 'bottoms' | 'one-pieces'> = {
  auto: 'auto',
  top: 'tops',
  bottom: 'bottoms',
  one_piece: 'one-pieces',
};

/** docs.fashn.ai/api-overview/api-fundamentals's own status list, mapped onto PR 450's normalised states. */
const FASHN_STATUS: Record<string, PhotoshootJobState> = {
  starting: 'queued',
  in_queue: 'queued',
  processing: 'processing',
  completed: 'succeeded',
  failed: 'failed',
};

/** `POST /v1/run` — model_name (the connected tier) plus `inputs`. Throws when the job is unsupported or a required image is missing. */
export function fashnGenerate(apiKey: string, tier: FashnConfig['tier'], baseUrl: string = FASHN_DEFAULT_BASE_URL, doFetch: typeof fetch = fetch) {
  return async (input: PhotoshootGenerateInput): Promise<PhotoshootGenerateResult> => {
    requirePhotoshootJobSupported(FASHN_PROVIDER, input.job, fashnCapabilities);
    if (!input.garmentImage?.url) throw new AdapterError('a photoshoot job needs its prepared garment image');
    if (!input.modelImage?.url) throw new AdapterError('FASHN try-on needs the model-library photo to transfer the garment onto');
    if (input.imageCount !== undefined && (input.imageCount < 1 || input.imageCount > 4)) {
      throw new AdapterError('FASHN accepts 1 to 4 images per call');
    }
    const body = {
      model_name: tier,
      inputs: {
        model_image: input.modelImage.url,
        garment_image: input.garmentImage.url,
        category: FASHN_CATEGORY[input.category ?? 'auto'],
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        ...(input.imageCount !== undefined ? { num_samples: input.imageCount } : {}),
      },
    };
    let res: Response;
    try {
      res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/v1/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AdapterError('FASHN did not answer the generate request');
    }
    const parsed = (await res.json().catch(() => ({}))) as FashnRunResponse;
    if (!res.ok || !parsed.id) throw new AdapterError(parsed.error ?? `FASHN refused the job (status ${res.status})`);
    return { providerJobId: parsed.id, status: 'queued' };
  };
}

async function fashnPollOnce(apiKey: string, baseUrl: string, doFetch: typeof fetch, providerJobId: string): Promise<{ res: Response; parsed: FashnStatusResponse }> {
  let res: Response;
  try {
    res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/v1/status/${providerJobId}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AdapterError('FASHN did not answer the status request');
  }
  const parsed = (await res.json().catch(() => ({}))) as FashnStatusResponse;
  return { res, parsed };
}

/** `GET /v1/status/{id}` mapped onto PR 450's normalised job state; never downloads the output. */
export function fashnStatus(apiKey: string, baseUrl: string = FASHN_DEFAULT_BASE_URL, doFetch: typeof fetch = fetch) {
  return async (providerJobId: string): Promise<PhotoshootStatusResult> => {
    const { parsed } = await fashnPollOnce(apiKey, baseUrl, doFetch, providerJobId);
    const mapped = parsed.status ? FASHN_STATUS[parsed.status] : undefined;
    if (!mapped) throw new AdapterError(`FASHN returned an unknown job status "${String(parsed.status)}"`);
    return { status: mapped, errorMessage: parsed.error?.message };
  };
}

/** Reads a succeeded job's output URLs and FASHN's own `x-fashn-credits-used` header; throws if not succeeded yet. */
export function fashnFetch(apiKey: string, baseUrl: string = FASHN_DEFAULT_BASE_URL, doFetch: typeof fetch = fetch) {
  return async (providerJobId: string): Promise<PhotoshootFetchResult> => {
    const { res, parsed } = await fashnPollOnce(apiKey, baseUrl, doFetch, providerJobId);
    if (parsed.status !== 'completed' || !parsed.output?.length) {
      throw new AdapterError(`the job has not succeeded yet (status "${String(parsed.status)}")`);
    }
    const creditsHeader = res.headers.get('x-fashn-credits-used');
    const creditsUsed = creditsHeader !== null ? Number(creditsHeader) : undefined;
    return { outputUrls: parsed.output, ...(creditsUsed !== undefined && !Number.isNaN(creditsUsed) ? { creditsUsed } : {}) };
  };
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
      estimate: (input: PhotoshootEstimateInput) => Promise.resolve(photoshootEstimateFromRate(input)),
      generate: fashnGenerate(apiKey, ctx.config.tier, baseUrl),
      status: fashnStatus(apiKey, baseUrl),
      fetch: fashnFetch(apiKey, baseUrl),
    };
  },
  async mock() {
    return mockPhotoshootProviderAdapter.mock(emptyPhotoshootMockContext);
  },
  async test(api) {
    return api.health();
  },
});
