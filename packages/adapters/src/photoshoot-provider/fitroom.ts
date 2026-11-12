// S24 · PR 449/450 — Fitroom (Blueprint C7.17's "other specialist flat-lay-to-model services exist (Claid, uwear.ai,
// Pixelcut, Fitroom and others)"), the second provider to benchmark against FASHN. Verified against
// https://developer.fitroom.app at implementation time (11 Nov 2026, Blueprint C7.17's own instruction): base
// `https://platform.fitroom.app`, the key in an `X-API-KEY` header. Job submission is `POST /api/tryon/v2/tasks` as
// **multipart form data** — `cloth_image` and `model_image` files plus `cloth_type` (`upper | lower | full_set`,
// no "auto") — returning `{ task_id, status: "CREATED" }`; Fitroom's own image fields take files, not URLs, so
// `generate()` reads each `PhotoshootImageRef.url` itself before building the form. Polling is `GET
// /api/tryon/v2/tasks/:id`, returning `{ task_id, status, progress, download_signed_url?, error? }` with `status`
// one of `CREATED | PROCESSING | COMPLETED | FAILED`; `download_signed_url` is set once `COMPLETED` and is itself
// temporary, so the caller downloads and re-stores it at once (C7.6).
//
// Fitroom publishes no account/credits endpoint either (a 402 on a real job means insufficient credit), so the same
// "ask for a task id that cannot exist" health check applies: an authenticated key gets back "not found"; an
// invalid one is refused outright (401/403) — never a generation call, C7.19.
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

export const FITROOM_PROVIDER = 'fitroom';
export const FITROOM_DEFAULT_BASE_URL = 'https://platform.fitroom.app';
// Well-formed, certain never to exist — only ever used to prove the key, never to touch a real job.
const HEALTH_PROBE_ID = '00000000-0000-0000-0000-000000000000';
const TIMEOUT_MS = 15_000;
const IMAGE_FETCH_TIMEOUT_MS = 20_000;

export const fitroomCapabilities: PhotoshootProviderCapabilities = { tryOn: true, ghostMannequin: false, premiumTier: false };

export const fitroomConfig = z.object({
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(300).optional(),
});
export type FitroomConfig = z.output<typeof fitroomConfig>;

interface FitroomTaskResponse {
  task_id?: string;
  status?: string;
  progress?: number;
  download_signed_url?: string;
  error?: string;
}

/** Fitroom has no "auto" — the caller must say which fit family this garment is. */
const FITROOM_CLOTH_TYPE: Partial<Record<PhotoshootGarmentCategory, 'upper' | 'lower' | 'full_set'>> = {
  top: 'upper',
  bottom: 'lower',
  one_piece: 'full_set',
};

/** developer.fitroom.app's own status list, mapped onto PR 450's normalised states. */
const FITROOM_STATUS: Record<string, PhotoshootJobState> = {
  CREATED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'succeeded',
  FAILED: 'failed',
};

async function fetchImageBytes(url: string, doFetch: typeof fetch): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  let res: Response;
  try {
    res = await doFetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  } catch {
    throw new AdapterError(`could not read the image to send to Fitroom (${url})`);
  }
  if (!res.ok) throw new AdapterError(`could not read the image to send to Fitroom (${url}, status ${res.status})`);
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
}

/** `POST /api/tryon/v2/tasks` (multipart). Throws when the job is unsupported, a required image is missing, or the category has no Fitroom equivalent. */
export function fitroomGenerate(apiKey: string, baseUrl: string = FITROOM_DEFAULT_BASE_URL, doFetch: typeof fetch = fetch) {
  return async (input: PhotoshootGenerateInput): Promise<PhotoshootGenerateResult> => {
    requirePhotoshootJobSupported(FITROOM_PROVIDER, input.job, fitroomCapabilities);
    if (!input.garmentImage?.url) throw new AdapterError('a photoshoot job needs its prepared garment image');
    if (!input.modelImage?.url) throw new AdapterError('Fitroom try-on needs the model-library photo to transfer the garment onto');
    if (input.imageCount !== undefined && input.imageCount !== 1) {
      throw new AdapterError('Fitroom returns one image per task; call generate once per image');
    }
    const clothType = input.category ? FITROOM_CLOTH_TYPE[input.category] : undefined;
    if (!clothType) throw new AdapterError('Fitroom needs an explicit garment category: top, bottom or one_piece (no "auto")');

    const [garment, model] = await Promise.all([fetchImageBytes(input.garmentImage.url, doFetch), fetchImageBytes(input.modelImage.url, doFetch)]);
    const form = new FormData();
    form.append('cloth_image', new Blob([garment.bytes], { type: garment.contentType }), 'garment');
    form.append('model_image', new Blob([model.bytes], { type: model.contentType }), 'model');
    form.append('cloth_type', clothType);

    let res: Response;
    try {
      res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/api/tryon/v2/tasks`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AdapterError('Fitroom did not answer the generate request');
    }
    const parsed = (await res.json().catch(() => ({}))) as FitroomTaskResponse;
    if (!res.ok || !parsed.task_id) throw new AdapterError(`Fitroom refused the job (status ${res.status})`);
    return { providerJobId: parsed.task_id, status: parsed.status ? FITROOM_STATUS[parsed.status] ?? 'queued' : 'queued' };
  };
}

async function fitroomPollOnce(apiKey: string, baseUrl: string, doFetch: typeof fetch, providerJobId: string): Promise<FitroomTaskResponse> {
  let res: Response;
  try {
    res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/api/tryon/v2/tasks/${providerJobId}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AdapterError('Fitroom did not answer the status request');
  }
  return (await res.json().catch(() => ({}))) as FitroomTaskResponse;
}

/** `GET /api/tryon/v2/tasks/:id` mapped onto PR 450's normalised job state; never downloads the output. */
export function fitroomStatus(apiKey: string, baseUrl: string = FITROOM_DEFAULT_BASE_URL, doFetch: typeof fetch = fetch) {
  return async (providerJobId: string): Promise<PhotoshootStatusResult> => {
    const parsed = await fitroomPollOnce(apiKey, baseUrl, doFetch, providerJobId);
    const mapped = parsed.status ? FITROOM_STATUS[parsed.status] : undefined;
    if (!mapped) throw new AdapterError(`Fitroom returned an unknown job status "${String(parsed.status)}"`);
    return { status: mapped, progressPercent: parsed.progress, errorMessage: parsed.error };
  };
}

/** Reads a succeeded job's signed output URL; Fitroom reports no credits figure (CN-018 — never invented). */
export function fitroomFetch(apiKey: string, baseUrl: string = FITROOM_DEFAULT_BASE_URL, doFetch: typeof fetch = fetch) {
  return async (providerJobId: string): Promise<PhotoshootFetchResult> => {
    const parsed = await fitroomPollOnce(apiKey, baseUrl, doFetch, providerJobId);
    if (parsed.status !== 'COMPLETED' || !parsed.download_signed_url) {
      throw new AdapterError(`the job has not succeeded yet (status "${String(parsed.status)}")`);
    }
    return { outputUrls: [parsed.download_signed_url] };
  };
}

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
      estimate: (input: PhotoshootEstimateInput) => Promise.resolve(photoshootEstimateFromRate(input)),
      generate: fitroomGenerate(apiKey, baseUrl),
      status: fitroomStatus(apiKey, baseUrl),
      fetch: fitroomFetch(apiKey, baseUrl),
    };
  },
  async mock() {
    return mockPhotoshootProviderAdapter.mock(emptyPhotoshootMockContext);
  },
  async test(api) {
    return api.health();
  },
});
