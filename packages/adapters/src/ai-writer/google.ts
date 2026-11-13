// S15 · PR 306 (C1.5) — Google's Generative Language API (Gemini) as a live `AiWriter`. One key and one model id,
// both the owner's own (Keys & connections); no model name here is to be trusted as current (Blueprint C1.5 —
// verify at implementation time). The Test sends one real sample draft and checks it answers; the key travels as a
// header, never in the address, so it never reaches a log line through a URL.
import { z } from 'zod';
import { AdapterError, defineAdapter, requireSecret } from '../define';
import { liveAiWriter, testLiveAiWriter, type Completer } from './live';
import { emptyMockContext, mockAiWriterAdapter } from './mock';
import type { AiWriter } from './shared';

export const GOOGLE_AI_PROVIDER = 'googleAi';
export const GOOGLE_AI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 60_000;

export const googleAiConfig = z.object({
  /** The model id the key may use (Google's own model list; typed in, never hard-coded here). */
  model: z.string().trim().min(1, 'a model id is needed'),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(300).optional(),
});
export type GoogleAiConfig = z.output<typeof googleAiConfig>;

interface GeminiBody {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

/** The Generative Language API's `generateContent` as a `Completer`. */
export function googleAiCompleter(apiKey: string, model: string, baseUrl: string, doFetch: typeof fetch = fetch): Completer {
  return async ({ system, user, maxTokens }) => {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AdapterError('Google did not answer');
    }
    const body = (await res.json().catch(() => ({}))) as GeminiBody;
    if (!res.ok) throw new AdapterError(`Google refused (${res.status})${body.error?.message ? `: ${body.error.message}` : ''}`);
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text.trim()) throw new AdapterError('Google answered with no text');
    const usage = body.usageMetadata && typeof body.usageMetadata.promptTokenCount === 'number' && typeof body.usageMetadata.candidatesTokenCount === 'number' ? { inputTokens: body.usageMetadata.promptTokenCount, outputTokens: body.usageMetadata.candidatesTokenCount } : undefined;
    return { text, ...(usage ? { usage } : {}) };
  };
}

export const googleAiWriterAdapter = defineAdapter<AiWriter, GoogleAiConfig>({
  kind: 'AI_PROVIDER',
  provider: GOOGLE_AI_PROVIDER,
  modes: ['LIVE'],
  secrets: ['apiKey'],
  configSchema: googleAiConfig,
  async create(ctx) {
    return liveAiWriter(googleAiCompleter(await requireSecret(ctx, 'apiKey'), ctx.config.model, ctx.config.baseUrl ?? GOOGLE_AI_DEFAULT_BASE_URL));
  },
  async mock() {
    return mockAiWriterAdapter.mock(emptyMockContext);
  },
  async test(api) {
    return testLiveAiWriter(api);
  },
});
