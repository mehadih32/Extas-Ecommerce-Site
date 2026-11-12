// S15 · PR 306 (C1.5) — OpenAI's Chat Completions API as a live `AiWriter` (openai-compatible.ts). One key and one
// model id, both the owner's own (Keys & connections); no model name here is to be trusted as current (Blueprint
// C1.5 — verify at implementation time). The Test sends one real sample draft and checks it answers.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { testLiveAiWriter, liveAiWriter } from './live';
import { emptyMockContext, mockAiWriterAdapter } from './mock';
import { openAiCompatibleCompleter } from './openai-compatible';
import type { AiWriter } from './shared';

export const OPENAI_PROVIDER = 'openAi';
export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export const openAiConfig = z.object({
  /** The model id the key may use (OpenAI's own model list; typed in, never hard-coded here). */
  model: z.string().trim().min(1, 'a model id is needed'),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(300).optional(),
});
export type OpenAiConfig = z.output<typeof openAiConfig>;

export const openAiAiWriterAdapter = defineAdapter<AiWriter, OpenAiConfig>({
  kind: 'AI_PROVIDER',
  provider: OPENAI_PROVIDER,
  modes: ['LIVE'],
  secrets: ['apiKey'],
  configSchema: openAiConfig,
  async create(ctx) {
    return liveAiWriter(openAiCompatibleCompleter({ apiKey: await requireSecret(ctx, 'apiKey'), model: ctx.config.model, baseUrl: ctx.config.baseUrl ?? OPENAI_DEFAULT_BASE_URL }));
  },
  async mock() {
    return mockAiWriterAdapter.mock(emptyMockContext);
  },
  async test(api) {
    return testLiveAiWriter(api);
  },
});
