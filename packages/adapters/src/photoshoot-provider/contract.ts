// S24 · PR 449 (Blueprint C7.17: "a provider adapter, exactly like payment and courier — mock/sandbox/live, with two
// or three providers behind one interface, so the owner can switch on price or quality without a rebuild"). Part 1
// wired the contract, the registered providers (FASHN AI, Fitroom) and a real health check. PR 450 adds the job
// methods themselves — estimate, generate, status, fetch — that `@extas/photoshoot`'s job orchestration (PR 451–452)
// will call against whichever provider the owner has connected, and that this PR's own tests call directly against
// a stand-in server (never the real network, never a real key — A1.3, C7.19).
//
// Gemini/OpenAI are never the garment-transfer engine (C7.17, Locked) — they stay in `ai-writer/` for text, and
// later for background/scene variation only; free/OpenRouter models are a hard no here, same as production writing.
import { AdapterError } from '../define';

/** What one connected provider can do, without calling it (drives which job it may be sent). */
export interface PhotoshootProviderCapabilities {
  /** Puts OUR garment onto a fixed model photo (C7.1's virtual try-on / garment-transfer step). */
  tryOn: boolean;
  /** Removes the mannequin from a ghost-mannequin shot and reconstructs the inner shape (C7.9). */
  ghostMannequin: boolean;
  /** Offers a premium tier (e.g. FASHN's Try-On Max, up to 4K) besides its baseline one. */
  premiumTier: boolean;
}

/** One generation job a connected provider may be asked to run (C7.5 step 7, C7.9). */
export type PhotoshootJobKind = 'tryOn' | 'ghostMannequin';

/** PR 450's own normalised job-state names; each provider's own strings are mapped onto these, never leaked raw. */
export type PhotoshootJobState = 'queued' | 'processing' | 'succeeded' | 'failed';

/** The garment's fit family (C7.5's standardisation step already knows this); drives each provider's own category field. */
export type PhotoshootGarmentCategory = 'auto' | 'top' | 'bottom' | 'one_piece';

export interface PhotoshootImageRef {
  /** An https URL the provider (or, for a provider that only takes file bytes, this adapter) can read the image from. */
  url: string;
}

export interface PhotoshootEstimateInput {
  /** How many output images the matching `generate()` call will ask for. */
  imageCount: number;
  /**
   * The owner's own per-image rate for this connected provider and tier (`studio.photoshoot.rates`), in paisa.
   * 0 means the owner has not set it yet — the estimate is then `null`, never an invented number (CN-018).
   */
  rateMinorPerImage: number;
}

export interface PhotoshootEstimate {
  /** `null` when the rate is not set yet (CN-018 — never an invented cost). */
  costMinor: number | null;
  currency: 'BDT';
}

export interface PhotoshootGenerateInput {
  job: PhotoshootJobKind;
  /** The prepared garment shot (PR 447's cut-out/standardisation output) — required for every job kind. */
  garmentImage: PhotoshootImageRef;
  /** The fixed model-library photo to transfer the garment onto — required for `tryOn`, omitted for `ghostMannequin`. */
  modelImage?: PhotoshootImageRef;
  /** Required by a provider whose category field has no "figure it out" option (Fitroom); optional where one does (FASHN). */
  category?: PhotoshootGarmentCategory;
  /** How many angle/variation outputs this one call asks for; a provider that returns exactly one rejects more than 1. */
  imageCount?: number;
  /** C7.5 step 7: "retried with a different seed on failure" — the caller supplies a new one on retry, never reused silently. */
  seed?: number;
}

export interface PhotoshootGenerateResult {
  providerJobId: string;
  status: PhotoshootJobState;
}

export interface PhotoshootStatusResult {
  status: PhotoshootJobState;
  /** 0–100 when the provider reports progress (Fitroom); absent when it doesn't (FASHN). */
  progressPercent?: number;
  /** Set only once failed — the provider's own message, never a secret (C7.6: provider secrets stay server-side only). */
  errorMessage?: string;
}

export interface PhotoshootFetchResult {
  /** One per requested output image; signed and temporary on the provider's own CDN — the caller downloads and
   * re-stores each one on our own media at once (C7.6), never serves on from here. */
  outputUrls: string[];
  /** The provider's own reported spend for this job, when it reports one (FASHN's credits header); absent when it
   * doesn't (Fitroom) — never invented (CN-018); the cost ledger (a later PR) uses it to true up the estimate. */
  creditsUsed?: number;
}

export interface PhotoshootProviderApi {
  /** The adapter's provider key (`mockPhotoshoot`, `fashn`, `fitroom`). */
  readonly provider: string;
  readonly capabilities: PhotoshootProviderCapabilities;
  /**
   * One cheap, real round trip that proves the key works (the Test button) — never a generation call: C7.19's
   * pilot spends only on real products the owner has put in front of him, never on a Test press.
   */
  health(): Promise<{ ok: boolean; message: string }>;
  /** Pure arithmetic, no network call — "cost shown before a batch" (C7.6). */
  estimate(input: PhotoshootEstimateInput): Promise<PhotoshootEstimate>;
  /** Submits one job. Throws when the provider can't do `input.job`, or a required field is missing. */
  generate(input: PhotoshootGenerateInput): Promise<PhotoshootGenerateResult>;
  /** Polls one job's state — never downloads the output; call `fetch` once this reports `succeeded`. */
  status(providerJobId: string): Promise<PhotoshootStatusResult>;
  /** Reads back a succeeded job's output. Throws when the job has not succeeded yet. */
  fetch(providerJobId: string): Promise<PhotoshootFetchResult>;
}

/** Pure arithmetic every provider's `estimate()` shares — a 0 rate means "the owner hasn't set one yet" (CN-018). */
export function photoshootEstimateFromRate(input: PhotoshootEstimateInput): PhotoshootEstimate {
  if (!(input.rateMinorPerImage > 0) || !(input.imageCount > 0)) return { costMinor: null, currency: 'BDT' };
  return { costMinor: Math.round(input.rateMinorPerImage * input.imageCount), currency: 'BDT' };
}

/** Throws, naming the provider, when a job kind is not among a connected provider's capabilities. */
export function requirePhotoshootJobSupported(provider: string, job: PhotoshootJobKind, capabilities: PhotoshootProviderCapabilities): void {
  if (job === 'tryOn' && !capabilities.tryOn) throw new AdapterError(`${provider} does not support try-on`);
  if (job === 'ghostMannequin' && !capabilities.ghostMannequin) throw new AdapterError(`${provider} does not support ghost-mannequin generation`);
}
