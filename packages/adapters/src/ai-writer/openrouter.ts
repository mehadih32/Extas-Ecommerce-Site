// S15 · PR 306 (C1.5) — OpenRouter as a live `AiWriter`: an OpenAI-compatible gateway (openai-compatible.ts) to many
// companies' models behind one key. Free / OpenRouter-style models are a hard no in production until a model has
// passed PR 580's qualification (Blueprint C1.5 V2), so a model id here is never assumed free — the owner picks what
// his key is allowed to use, and the AI Cost Book (PR 312) is where "is this model free" is recorded, not here.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { liveAiWriter, testLiveAiWriter } from './live';
import { emptyMockContext, mockAiWriterAdapter } from './mock';
import { openAiCompatibleCompleter } from './openai-compatible';
import type { AiWriter } from './shared';

export const OPENROUTER_PROVIDER = 'openRouter';
export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export const openRouterConfig = z.object({
  /** The model id the key may use (OpenRouter's own model list; typed in, never hard-coded here). */
  model: z.string().trim().min(1, 'a model id is needed'),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(300).optional(),
  /** OpenRouter's recommended attribution headers (HTTP-Referer, X-Title); optional, never required to answer. */
  appUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(300).optional(),
  appName: z.string().trim().max(100).optional(),
});
export type OpenRouterConfig = z.output<typeof openRouterConfig>;

/** OpenRouter's recommended attribution headers, only for the ones the owner filled in. */
export function openRouterAttributionHeaders(config: Pick<OpenRouterConfig, 'appUrl' | 'appName'>): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.appUrl) headers['HTTP-Referer'] = config.appUrl;
  if (config.appName) headers['X-Title'] = config.appName;
  return headers;
}

export const openRouterAiWriterAdapter = defineAdapter<AiWriter, OpenRouterConfig>({
  kind: 'AI_PROVIDER',
  provider: OPENROUTER_PROVIDER,
  modes: ['LIVE'],
  secrets: ['apiKey'],
  configSchema: openRouterConfig,
  async create(ctx) {
    return liveAiWriter(openAiCompatibleCompleter({ apiKey: await requireSecret(ctx, 'apiKey'), model: ctx.config.model, baseUrl: ctx.config.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL, extraHeaders: openRouterAttributionHeaders(ctx.config) }));
  },
  async mock() {
    return mockAiWriterAdapter.mock(emptyMockContext);
  },
  async test(api) {
    return testLiveAiWriter(api);
  },
});
