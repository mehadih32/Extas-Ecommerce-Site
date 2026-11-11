// S25 · PR 482 (Blueprint C7.17, C8.1, C8.2) — the image-to-video provider adapter: estimates and, once live, generates
// a short clip whose first frame is an already-approved still (never text-to-video, C8.1). Kind `AI_PROVIDER` — the
// same kind the AI writer uses (C7.20: "provider and model choice for images lives in the same AI 360 screen as the
// text models", one place answers "which company, which package, for which job" for the whole business).
//
// No real video provider is connected yet (FASHN-style and a second provider are benchmarked per C7.17 before this
// adapter gets a LIVE mode), so only the mock exists today. The mock is honest, not a fabrication: `estimate` is pure
// arithmetic on the rate the owner has set (`studio.video.costPerSecondMinor`, 0 until he sets one — CN-018, never an
// invented number), and `createClip`'s mock never invents footage — it hands back the job's own approved source still
// as the output, clearly marked `practice: true` (the same honest-preview rule PR 439/440 set for S23's render
// engine), so the rest of the pipeline (job orchestration PR 483, best-of-2 and review PR 484) can be built and
// tested end to end today. A later PR adds the real LIVE adapter here without touching the package above it.
import { z } from 'zod';
import { AdapterError, defineAdapter } from '../define';

export const VIDEO_ASPECTS = ['9:16', '1:1', '4:5', '16:9'] as const;
export type VideoAspect = (typeof VIDEO_ASPECTS)[number];

export interface VideoEstimateInput {
  durationSec: number;
  aspect: VideoAspect;
  /** The owner's own rate (`studio.video.costPerSecondMinor`), in poysha/paisa (minor units); 0 = not set yet. */
  ratePerSecondMinor: number;
}

export interface VideoEstimate {
  /** `null` when the owner has not set a rate yet — never an invented cost (CN-018). */
  costMinor: number | null;
  currency: 'BDT';
}

export interface VideoClipInput {
  /** The already-approved still this clip moves from (Blueprint C8.1: image-to-video from an approved still only). */
  sourceAssetId: string;
  durationSec: number;
  aspect: VideoAspect;
}

export interface VideoClipResult {
  providerJobId: string;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  /** Set once SUCCEEDED. The mock's is always the source still itself (honest preview, never fabricated footage). */
  outputAssetId?: string;
  /** True for the mock's honest preview (the source still, not a generated clip). */
  practice: boolean;
}

export interface VideoProvider {
  estimate(input: VideoEstimateInput): Promise<VideoEstimate>;
  /** Starts (or, for the mock, immediately finishes) one clip job. */
  createClip(input: VideoClipInput): Promise<VideoClipResult>;
}

/** Pure: the mock's and, later, any LIVE provider's shared arithmetic — a rate of 0 means "not set yet". */
export function estimateFromRate(input: VideoEstimateInput): VideoEstimate {
  if (!(input.ratePerSecondMinor > 0) || !(input.durationSec > 0)) return { costMinor: null, currency: 'BDT' };
  return { costMinor: Math.round(input.ratePerSecondMinor * input.durationSec), currency: 'BDT' };
}

export const mockVideoProviderAdapter = defineAdapter<VideoProvider, Record<string, never>>({
  kind: 'AI_PROVIDER',
  provider: 'mockVideoProvider',
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no video provider is connected yet; the honest preview serves until one is added');
  },
  async mock() {
    return {
      async estimate(input) {
        if (!VIDEO_ASPECTS.includes(input.aspect)) throw new AdapterError(`unknown aspect "${input.aspect}"`);
        return estimateFromRate(input);
      },
      async createClip(input) {
        if (!input.sourceAssetId) throw new AdapterError('a clip job needs its source still');
        if (!(input.durationSec > 0)) throw new AdapterError('a clip needs a duration');
        return { providerJobId: `mock-${input.sourceAssetId}-${input.durationSec}-${input.aspect}`, status: 'SUCCEEDED', outputAssetId: input.sourceAssetId, practice: true };
      },
    };
  },
  async test() {
    return { ok: true, message: 'honest preview video provider: nothing leaves the server, no footage is generated' };
  },
});

export const videoProviderAdapters = [mockVideoProviderAdapter] as const;
