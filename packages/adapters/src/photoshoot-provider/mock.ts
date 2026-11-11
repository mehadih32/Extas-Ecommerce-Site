// S24 · PR 449/450 — the practice photoshoot provider: every job runs here until a real provider's key is entered
// and its Test passes (A1.3). Its job methods never touch the network: `generate` answers at once, honestly — it
// never invents imagery (the same rule PR 439/440 set for S23's render engine), it hands back the garment shot
// itself as the "output" so the rest of the pipeline (job orchestration PR 451–452, review PR 455) can be built and
// tested end to end today. The whole round trip is encoded in the job id itself (no database here), so `status` and
// `fetch` need no stored state.
import { z } from 'zod';
import { AdapterError, defineAdapter, type AdapterContext } from '../define';
import {
  photoshootEstimateFromRate,
  type PhotoshootEstimate,
  type PhotoshootEstimateInput,
  type PhotoshootFetchResult,
  type PhotoshootGenerateInput,
  type PhotoshootGenerateResult,
  type PhotoshootJobKind,
  type PhotoshootProviderApi,
  type PhotoshootProviderCapabilities,
  type PhotoshootStatusResult,
} from './contract';

export const MOCK_PHOTOSHOOT_PROVIDER = 'mockPhotoshoot';

/** The mock takes no settings; every live provider's `mock()` passes this when it falls back to practice. */
export const emptyPhotoshootMockContext: AdapterContext<Record<string, never>> = { mode: 'MOCK', config: {}, storeId: null, async secret() { return null; } };

export const mockPhotoshootCapabilities: PhotoshootProviderCapabilities = { tryOn: true, ghostMannequin: true, premiumTier: false };

const MOCK_JOB_PREFIX = 'mock-';

interface MockJobPayload {
  job: PhotoshootJobKind;
  garmentUrl: string;
}

function encodeMockJobId(payload: MockJobPayload): string {
  return `${MOCK_JOB_PREFIX}${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}

function decodeMockJobId(providerJobId: string): MockJobPayload {
  if (!providerJobId.startsWith(MOCK_JOB_PREFIX)) throw new AdapterError(`unknown practice job id "${providerJobId}"`);
  try {
    const parsed = JSON.parse(Buffer.from(providerJobId.slice(MOCK_JOB_PREFIX.length), 'base64url').toString('utf8')) as MockJobPayload;
    if (typeof parsed?.garmentUrl !== 'string') throw new Error('malformed');
    return parsed;
  } catch {
    throw new AdapterError(`unknown practice job id "${providerJobId}"`);
  }
}

export async function mockPhotoshootEstimate(input: PhotoshootEstimateInput): Promise<PhotoshootEstimate> {
  return photoshootEstimateFromRate(input);
}

export async function mockPhotoshootGenerate(input: PhotoshootGenerateInput): Promise<PhotoshootGenerateResult> {
  if (!input.garmentImage?.url) throw new AdapterError('a photoshoot job needs its prepared garment image');
  if (input.job === 'tryOn' && !input.modelImage?.url) {
    throw new AdapterError('try-on needs the model-library photo to transfer the garment onto');
  }
  return { providerJobId: encodeMockJobId({ job: input.job, garmentUrl: input.garmentImage.url }), status: 'succeeded' };
}

export async function mockPhotoshootStatus(providerJobId: string): Promise<PhotoshootStatusResult> {
  decodeMockJobId(providerJobId);
  return { status: 'succeeded' };
}

export async function mockPhotoshootFetch(providerJobId: string): Promise<PhotoshootFetchResult> {
  const { garmentUrl } = decodeMockJobId(providerJobId);
  // Honest preview, never a fabrication: the practice provider hands back the garment shot itself as the "output".
  return { outputUrls: [garmentUrl] };
}

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
      estimate: mockPhotoshootEstimate,
      generate: mockPhotoshootGenerate,
      status: mockPhotoshootStatus,
      fetch: mockPhotoshootFetch,
    };
  },
  async test(api) {
    return api.health();
  },
});
