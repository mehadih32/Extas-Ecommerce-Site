// S15 · PR 306 — the Chat Completions request/response shape that OpenAI's API and OpenRouter's API (OpenAI-compatible)
// both answer to, written once and used by openai.ts and openrouter.ts with their own address, key and headers.
import { AdapterError } from '../define';
import type { Completer } from './live';

export interface OpenAiCompatibleOptions {
  apiKey: string;
  model: string;
  /** Without a trailing slash; the path `/chat/completions` is added. */
  baseUrl: string;
  /** Extra headers a provider needs beyond Authorization (OpenRouter's HTTP-Referer, X-Title). */
  extraHeaders?: Record<string, string>;
  fetch?: typeof fetch;
}

interface ChatBody {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

const TIMEOUT_MS = 60_000;

/** A Chat Completions-shaped `Completer` (OpenAI, OpenRouter): one user message, an optional system message. */
export function openAiCompatibleCompleter(o: OpenAiCompatibleOptions): Completer {
  const doFetch = o.fetch ?? fetch;
  return async ({ system, user, maxTokens }) => {
    let res: Response;
    try {
      res = await doFetch(`${o.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${o.apiKey}`, ...o.extraHeaders },
        body: JSON.stringify({ model: o.model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AdapterError('the AI service did not answer');
    }
    const body = (await res.json().catch(() => ({}))) as ChatBody;
    if (!res.ok) throw new AdapterError(`the AI service refused (${res.status})${body.error?.message ? `: ${body.error.message}` : ''}`);
    const text = body.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) throw new AdapterError('the AI service answered with no text');
    return { text };
  };
}
