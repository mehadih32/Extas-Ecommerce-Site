// S24 · PR 449 (Blueprint C7.17: "a provider adapter, exactly like payment and courier — mock/sandbox/live, with two
// or three providers behind one interface, so the owner can switch on price or quality without a rebuild"). Part 1:
// the contract and the registered providers (FASHN AI, Fitroom) with their keys and a real health check. PR 450
// adds the job methods themselves (estimate, generate, status, fetch) that `@extas/photoshoot`'s job orchestration
// (PR 451–452) will call against whichever provider the owner has connected.
//
// Gemini/OpenAI are never the garment-transfer engine (C7.17, Locked) — they stay in `ai-writer/` for text, and
// later for background/scene variation only; free/OpenRouter models are a hard no here, same as production writing.

/** What one connected provider can do, without calling it (drives which job it may be sent). */
export interface PhotoshootProviderCapabilities {
  /** Puts OUR garment onto a fixed model photo (C7.1's virtual try-on / garment-transfer step). */
  tryOn: boolean;
  /** Removes the mannequin from a ghost-mannequin shot and reconstructs the inner shape (C7.9). */
  ghostMannequin: boolean;
  /** Offers a premium tier (e.g. FASHN's Try-On Max, up to 4K) besides its baseline one. */
  premiumTier: boolean;
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
}
