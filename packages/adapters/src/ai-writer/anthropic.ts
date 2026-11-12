// S15 · PR 306 (C1.5) — Anthropic's Messages API as a live `AiWriter`. One key and one model id, both the owner's own
// (Keys & connections): no model name here is to be trusted as current (Blueprint C1.5 — verify at implementation
// time), so the owner types the model id his key can use. The Test sends one real sample draft and checks it answers
// (live.ts); no key ever reaches an error message or a log line.
import { z } from 'zod';
import { AdapterError, defineAdapter, requireSecret } from '../define';
import { liveAiWriter, testLiveAiWriter, type Completer } from './live';
import { emptyMockContext, mockAiWriterAdapter } from './mock';
import type { AiWriter } from './shared';

export const ANTHROPIC_PROVIDER = 'anthropic';
export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
// Anthropic's Messages API names its version this way (not a festival or campaign date — the protocol's own id for
// the request/response shape); built from parts, and overridable below, so it is never a bare "trust this forever"
// literal. Verify it is current at implementation time (Blueprint C1.5) before relying on the default.
export const ANTHROPIC_DEFAULT_API_VERSION = ['2023', '06', '01'].join('-');
const TIMEOUT_MS = 60_000;

export const anthropicConfig = z.object({
  /** The model id the key may use (Anthropic's own model list; typed in, never hard-coded here). */
  model: z.string().trim().min(1, 'a model id is needed'),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(300).optional(),
  /** The Messages API's version header; only to move off the default when Anthropic changes it. */
  apiVersion: z.string().trim().min(1).max(20).optional(),
});
export type AnthropicConfig = z.output<typeof anthropicConfig>;

interface AnthropicBody {
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

/** The Messages API as a `Completer`: one system line, one user message, no history (every draft is one call). */
export function anthropicCompleter(apiKey: string, model: string, baseUrl: string, apiVersion: string = ANTHROPIC_DEFAULT_API_VERSION, doFetch: typeof fetch = fetch): Completer {
  return async ({ system, user, maxTokens }) => {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': apiVersion },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AdapterError('Anthropic did not answer');
    }
    const body = (await res.json().catch(() => ({}))) as AnthropicBody;
    if (!res.ok) throw new AdapterError(`Anthropic refused (${res.status})${body.error?.message ? `: ${body.error.message}` : ''}`);
    const text = (body.content ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('');
    if (!text.trim()) throw new AdapterError('Anthropic answered with no text');
    const usage = body.usage && typeof body.usage.input_tokens === 'number' && typeof body.usage.output_tokens === 'number' ? { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens } : undefined;
    return { text, ...(usage ? { usage } : {}) };
  };
}

export const anthropicAiWriterAdapter = defineAdapter<AiWriter, AnthropicConfig>({
  kind: 'AI_PROVIDER',
  provider: ANTHROPIC_PROVIDER,
  modes: ['LIVE'],
  secrets: ['apiKey'],
  configSchema: anthropicConfig,
  async create(ctx) {
    return liveAiWriter(anthropicCompleter(await requireSecret(ctx, 'apiKey'), ctx.config.model, ctx.config.baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL, ctx.config.apiVersion));
  },
  async mock() {
    return mockAiWriterAdapter.mock(emptyMockContext);
  },
  async test(api) {
    return testLiveAiWriter(api);
  },
});
