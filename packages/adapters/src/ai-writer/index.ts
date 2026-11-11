// S11 · PR 221 — the AI writer: drafts a page's search title and meta description from the page's own facts. AI helpers
// stay off until the owner turns them on (CN-026: `ai.enabled`, and `seo.aiDrafts.enabled` for this one). Until an AI
// provider is connected and its Test passes, every draft comes from the mock (mock.ts): it writes nothing it was not
// given — the facts joined in order and cut to the limits — and it says it is practice text. A draft is never used on
// a page until a person accepts it in Website › SEO.
//
// S15 · PR 306 (C1.5) adds the real providers: Anthropic (anthropic.ts), OpenAI (openai.ts), Google (google.ts) and
// OpenRouter (openrouter.ts), each one key + one model id in Keys & connections, each falling back to the mock until
// its Test passes. Every provider answers the exact same `AiWriter` contract (shared.ts) through one prompt-and-parse
// layer (prompts.ts, live.ts) so a caller never has to know which company wrote the words. `aiWriterAdapters` is the
// full set (mock + live) the AI writer's connection layer picks from; `liveAiWriterAdapters` is the live ones only —
// rows in Keys & connections (`allAdapters`) and the only ones with a key to type in.
//
// S14 · PR 293 — the AI campaign writer: 2–3 versions of an offer SMS or e-mail in the owner's own voice (his greeting,
// his sign-off, how he talks), from what the owner says the message is about. The practice writer joins only what it was
// given — the greeting, the brief, the link word, the sign-off — in a different order and length per version; a live
// provider gets the same input.
//
// S12 · PR 243 — the AI article writer: a first draft of a journal article from its brief (PR 528) in the brief's
// language — English or Bengali, chosen per article —, never without a brief. The practice writer joins only the brief's
// own words (the title, the search phrase, the outline as headings, the facts, the shop links, the note) into the
// editor's writing format and says it is practice text; a live provider gets the same input. The draft is an article in
// writing: a person still edits it and it passes the three review steps before anyone can publish it.
export * from './shared';
export * from './mock';
export * from './prompts';
export * from './live';
export * from './openai-compatible';
export * from './anthropic';
export * from './openai';
export * from './google';
export * from './openrouter';

import { mockAiWriterAdapter } from './mock';
import { anthropicAiWriterAdapter } from './anthropic';
import { openAiAiWriterAdapter } from './openai';
import { googleAiWriterAdapter } from './google';
import { openRouterAiWriterAdapter } from './openrouter';

/** Every AI writer adapter (the connection layer's fallback chain): the mock, then every live provider. */
export const aiWriterAdapters = [mockAiWriterAdapter, anthropicAiWriterAdapter, openAiAiWriterAdapter, googleAiWriterAdapter, openRouterAiWriterAdapter] as const;

/** PR 306 — the AI writer adapters with keys: rows in Keys & connections (`allAdapters`). */
export const liveAiWriterAdapters = [anthropicAiWriterAdapter, openAiAiWriterAdapter, googleAiWriterAdapter, openRouterAiWriterAdapter] as const;
