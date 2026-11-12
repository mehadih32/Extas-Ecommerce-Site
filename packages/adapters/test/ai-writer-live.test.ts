// S15 · PR 306 (C1.5) — the four live AI writer adapters (Anthropic, OpenAI, Google, OpenRouter): each turns one
// provider's HTTP answer into the same `AiWriter` contract the mock already answers, through the shared
// prompt-and-parse layer (prompts.ts, live.ts). No real network call: `fetch` is replaced in every test.
import { describe, expect, it, vi } from 'vitest';
import {
  ANTHROPIC_DEFAULT_API_VERSION,
  anthropicAiWriterAdapter,
  anthropicCompleter,
  googleAiCompleter,
  googleAiWriterAdapter,
  liveAiWriter,
  openAiAiWriterAdapter,
  openAiCompatibleCompleter,
  openRouterAiWriterAdapter,
  openRouterAttributionHeaders,
  testLiveAiWriter,
  type AiCampaignInput,
  type AiSeoInput,
} from '../src';

const ctx = (model = 'test-model') => ({ mode: 'LIVE' as const, config: { model }, storeId: 1, secret: async () => 'secret-key' });

const seoInput: AiSeoInput = { subject: 'product', locale: 'en', facts: { name: 'Sample Pique Polo', brand: 'Sample Brand' }, max: { title: 60, description: 155 } };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('shared live AiWriter (PR 306)', () => {
  it('turns a Completer into draftSeo, draftCampaign and draftArticle, each practice: false', async () => {
    const complete = vi.fn(async ({ user }: { user: string }) => ({
      text: user.includes('versions')
        ? '```json\n{"versions": [{"subject": "Winter polos", "body": "New winter polos. {link}"}, {"subject": "Sale", "body": "Ten colours. {link}"}]}\n```'
        : user.includes('journal article')
          ? '{"excerpt": "Why polo collars curl", "body": "## Why it happens\\nFabric relaxes."}'
          : '{"title": "Sample Pique Polo | Sample Brand", "description": "A classic polo."}',
    }));
    const w = liveAiWriter(complete);

    const seo = await w.draftSeo(seoInput);
    expect(seo).toEqual({ title: 'Sample Pique Polo | Sample Brand', description: 'A classic polo.', practice: false });

    const campaign: AiCampaignInput = { channel: 'email', locale: 'en', brief: 'Winter polos', voice: { greeting: 'Dear', signOff: 'Team', style: '' }, versions: 2, words: ['link'], max: { subject: 80, body: 300 } };
    const camp = await w.draftCampaign(campaign);
    expect(camp.practice).toBe(false);
    expect(camp.versions).toHaveLength(2);
    expect(camp.versions[0]!.body).toContain('{link}');

    const article = await w.draftArticle({ locale: 'en', title: 'Why polo collars curl', query: null, keywords: ['polo collar'], intent: 'howto', wordCount: 400, outline: ['Why it happens'], mustInclude: null, links: [], notes: null });
    expect(article).toEqual({ excerpt: 'Why polo collars curl', body: '## Why it happens\nFabric relaxes.', practice: false });

    expect(complete).toHaveBeenCalledTimes(3);
  });

  it('drops any {brace} the model used that was not on the allowed word list', async () => {
    const complete = vi.fn(async () => ({ text: '{"versions": [{"body": "Hi {customerName}, see {secretWord} now {link}"}, {"body": "Second {link}"}]}' }));
    const w = liveAiWriter(complete);
    const d = await w.draftCampaign({ channel: 'sms', locale: 'en', brief: 'x', voice: { greeting: '', signOff: '', style: '' }, versions: 2, words: ['customerName', 'link'], max: { subject: 0, body: 200 } });
    expect(d.versions[0]!.body).toBe('Hi {customerName}, see  now {link}');
  });

  it('throws when the model answers with no JSON, or with the wrong shape', async () => {
    const w = liveAiWriter(async () => ({ text: 'Sure, here is a title: Great Polo' }));
    await expect(w.draftSeo(seoInput)).rejects.toThrow('JSON');
    const w2 = liveAiWriter(async () => ({ text: '{"onlyTitle": "x"}' }));
    await expect(w2.draftSeo(seoInput)).rejects.toThrow('title');
  });

  it('testLiveAiWriter reports ok on a real-shaped answer and fails cleanly otherwise', async () => {
    const ok = await testLiveAiWriter(liveAiWriter(async () => ({ text: '{"title": "A title", "description": "A description."}' })));
    expect(ok).toMatchObject({ ok: true });
    const bad = await testLiveAiWriter(liveAiWriter(async () => ({ text: 'not json' })));
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/JSON/);
  });

  // S15 · PR 325 — draftSupportReply: a warmer rephrasing of the rule-based draft, never a new fact, usage passed through.
  it('draftSupportReply rephrases the rule-based draft, practice: false, carrying the provider\'s own usage', async () => {
    const complete = vi.fn(async () => ({ text: '{"body": "Hi there! Your order EX1 is already on its way."}', usage: { inputTokens: 120, outputTokens: 18 } }));
    const w = liveAiWriter(complete);
    const d = await w.draftSupportReply({ locale: 'en', question: 'where is my order', facts: { intent: 'status', orderNumber: 'EX1' }, ruleBasedBody: 'Hi, order EX1 is on its way.', max: { body: 300 } });
    expect(d).toEqual({ body: 'Hi there! Your order EX1 is already on its way.', practice: false, usage: { inputTokens: 120, outputTokens: 18 } });
  });

  it('draftSupportReply throws cleanly when the model answers with no body, and carries no usage when the provider reported none', async () => {
    const w = liveAiWriter(async () => ({ text: '{"notBody": "x"}' }));
    await expect(w.draftSupportReply({ locale: 'en', question: 'x', facts: { intent: 'status' }, ruleBasedBody: 'x', max: { body: 100 } })).rejects.toThrow('reply');
    const w2 = liveAiWriter(async () => ({ text: '{"body": "ok"}' }));
    const d = await w2.draftSupportReply({ locale: 'en', question: 'x', facts: { intent: 'status' }, ruleBasedBody: 'x', max: { body: 100 } });
    expect(d.usage).toBeUndefined();
  });

  // S15 · PR 326 — draftProductDescription: a shop-facing description from the product's own attributes, never an
  // invented spec, carrying the provider's own usage through the same generic `complete()` plumbing PR 325 built.
  it('draftProductDescription writes from the product\'s own attributes, practice: false, carrying the provider\'s own usage', async () => {
    const complete = vi.fn(async () => ({ text: '{"body": "A navy pique polo in sizes S-L, 100% cotton."}', usage: { inputTokens: 90, outputTokens: 14 } }));
    const w = liveAiWriter(complete);
    const d = await w.draftProductDescription({ locale: 'en', facts: { name: 'Sample Pique Polo', colours: ['Navy'], sizes: ['S', 'M', 'L'], fabric: 'Cotton' }, max: { body: 300 } });
    expect(d).toEqual({ body: 'A navy pique polo in sizes S-L, 100% cotton.', practice: false, usage: { inputTokens: 90, outputTokens: 14 } });
  });

  it('draftProductDescription throws cleanly when the model answers with no body, and carries no usage when the provider reported none', async () => {
    const w = liveAiWriter(async () => ({ text: '{"notBody": "x"}' }));
    await expect(w.draftProductDescription({ locale: 'en', facts: { name: 'Sample Tee' }, max: { body: 100 } })).rejects.toThrow('description');
    const w2 = liveAiWriter(async () => ({ text: '{"body": "ok"}' }));
    const d = await w2.draftProductDescription({ locale: 'en', facts: { name: 'Sample Tee' }, max: { body: 100 } });
    expect(d.usage).toBeUndefined();
  });

  // S15 · PR 328 — draftSizeAdvice: one grounded sentence on why Find My Size gave that size, never a new size,
  // carrying the provider's own usage through the same generic `complete()` plumbing PR 325 built.
  it('draftSizeAdvice writes from the recommendation\'s own measurements, practice: false, carrying the provider\'s own usage', async () => {
    const complete = vi.fn(async () => ({ text: '{"body": "Size L fits because its chest of 44in comfortably covers your estimated need of 42in."}', usage: { inputTokens: 70, outputTokens: 18 } }));
    const w = liveAiWriter(complete);
    const d = await w.draftSizeAdvice({ locale: 'en', facts: { sizeLabel: 'L', fieldLabel: 'Chest', valueInch: 44, needInch: 42, bodyInch: 40, easeInch: 2, covered: true, heightIn: 67, weightKg: 68 }, max: { body: 240 } });
    expect(d).toEqual({ body: 'Size L fits because its chest of 44in comfortably covers your estimated need of 42in.', practice: false, usage: { inputTokens: 70, outputTokens: 18 } });
  });

  it('draftSizeAdvice throws cleanly when the model answers with no body, and carries no usage when the provider reported none', async () => {
    const w = liveAiWriter(async () => ({ text: '{"notBody": "x"}' }));
    await expect(w.draftSizeAdvice({ locale: 'en', facts: { sizeLabel: 'L', fieldLabel: 'Chest', valueInch: 44, needInch: 42, bodyInch: 40, easeInch: 2, covered: true, heightIn: 67, weightKg: 68 }, max: { body: 240 } })).rejects.toThrow('size explanation');
    const w2 = liveAiWriter(async () => ({ text: '{"body": "ok"}' }));
    const d = await w2.draftSizeAdvice({ locale: 'en', facts: { sizeLabel: 'L', fieldLabel: 'Chest', valueInch: 44, needInch: 42, bodyInch: 40, easeInch: 2, covered: true, heightIn: 67, weightKg: 68 }, max: { body: 240 } });
    expect(d.usage).toBeUndefined();
  });

  // S15 · PR 329 — draftFraudReviewNote: one plain paragraph on why a review alert fired, never a decision,
  // carrying the provider's own usage through the same generic `complete()` plumbing PR 325 built.
  it('draftFraudReviewNote writes from the alert\'s own already-decided reasons, practice: false, carrying the provider\'s own usage', async () => {
    const complete = vi.fn(async () => ({ text: '{"body": "This order was raised because it repeats another order\'s items within a few days."}', usage: { inputTokens: 90, outputTokens: 24 } }));
    const w = liveAiWriter(complete);
    const d = await w.draftFraudReviewNote({ locale: 'en', facts: { kind: 'duplicate', severity: 'High', why: ['A · Same customer, same items again · 100% sure · within 5 days · proposes cancel'], matches: ['EX-1002 · Processing · 3 Nov · ৳1,200'], history: ['3 orders, 2 delivered'] }, max: { body: 400 } });
    expect(d).toEqual({ body: "This order was raised because it repeats another order's items within a few days.", practice: false, usage: { inputTokens: 90, outputTokens: 24 } });
  });

  it('draftFraudReviewNote throws cleanly when the model answers with no body, and carries no usage when the provider reported none', async () => {
    const facts = { kind: 'duplicate' as const, why: ['A · Same customer, same items again · 100% sure · within 5 days · proposes cancel'], matches: [], history: [] };
    const w = liveAiWriter(async () => ({ text: '{"notBody": "x"}' }));
    await expect(w.draftFraudReviewNote({ locale: 'en', facts, max: { body: 400 } })).rejects.toThrow('review explanation');
    const w2 = liveAiWriter(async () => ({ text: '{"body": "ok"}' }));
    const d = await w2.draftFraudReviewNote({ locale: 'en', facts, max: { body: 400 } });
    expect(d.usage).toBeUndefined();
  });

  // S15 · PR 330 — draftApprovalExplainNote: one plain paragraph explaining an approval-queue item, never a
  // decision, carrying the provider's own usage through the same generic `complete()` plumbing PR 325 built.
  it('draftApprovalExplainNote writes from the item\'s own already-decided title and reasons, practice: false, carrying the provider\'s own usage', async () => {
    const complete = vi.fn(async () => ({ text: '{"body": "The system is asking because this campaign has been spending with no delivered order."}', usage: { inputTokens: 60, outputTokens: 18 } }));
    const w = liveAiWriter(complete);
    const d = await w.draftApprovalExplainNote({ locale: 'en', facts: { title: 'Pause Winter Polos: campaign spent ৳1,200 with no delivered order', why: ['spent ৳1,200 over 3 Oct–9 Oct with 0 delivered orders'] }, max: { body: 250 } });
    expect(d).toEqual({ body: 'The system is asking because this campaign has been spending with no delivered order.', practice: false, usage: { inputTokens: 60, outputTokens: 18 } });
  });

  it('draftApprovalExplainNote throws cleanly when the model answers with no body, and carries no usage when the provider reported none', async () => {
    const facts = { title: 'Pause Winter Polos', why: [] as string[] };
    const w = liveAiWriter(async () => ({ text: '{"notBody": "x"}' }));
    await expect(w.draftApprovalExplainNote({ locale: 'en', facts, max: { body: 250 } })).rejects.toThrow('approval explanation');
    const w2 = liveAiWriter(async () => ({ text: '{"body": "ok"}' }));
    const d = await w2.draftApprovalExplainNote({ locale: 'en', facts, max: { body: 250 } });
    expect(d.usage).toBeUndefined();
  });

  // S15 · PR 331 — draftSocialReelCaption: one short caption with a hook for a reel/short render-queue template,
  // carrying the provider's own usage through the same generic `complete()` plumbing PR 325 built.
  it('draftSocialReelCaption writes from the template\'s own name and notes, practice: false, carrying the provider\'s own usage', async () => {
    const complete = vi.fn(async () => ({ text: '{"body": "New arrivals just dropped — swipe to see every colour."}', usage: { inputTokens: 40, outputTokens: 15 } }));
    const w = liveAiWriter(complete);
    const d = await w.draftSocialReelCaption({ locale: 'en', facts: { templateName: 'Reel — new arrivals', notes: 'Upbeat, fast cuts' }, max: { body: 220 } });
    expect(d).toEqual({ body: 'New arrivals just dropped — swipe to see every colour.', practice: false, usage: { inputTokens: 40, outputTokens: 15 } });
  });

  it('draftSocialReelCaption throws cleanly when the model answers with no body, and carries no usage when the provider reported none', async () => {
    const facts = { templateName: 'Reel — new arrivals' };
    const w = liveAiWriter(async () => ({ text: '{"notBody": "x"}' }));
    await expect(w.draftSocialReelCaption({ locale: 'en', facts, max: { body: 220 } })).rejects.toThrow('caption');
    const w2 = liveAiWriter(async () => ({ text: '{"body": "ok"}' }));
    const d = await w2.draftSocialReelCaption({ locale: 'en', facts, max: { body: 220 } });
    expect(d.usage).toBeUndefined();
  });

  // S15 · PR 327 — draftSeo now carries the provider's own real usage too, the same way PR 325/326 already thread
  // it through `complete()` — the SEO & meta agent's own job dispatcher (seo-meta-dispatch.ts) records it to the
  // ledger exactly like support's and the product content agent's.
  it('draftSeo carries the provider\'s own usage when it reports one, and none when it does not', async () => {
    const complete = vi.fn(async () => ({ text: '{"title": "Sample Pique Polo | Sample Brand", "description": "A classic polo."}', usage: { inputTokens: 64, outputTokens: 11 } }));
    const w = liveAiWriter(complete);
    const d = await w.draftSeo(seoInput);
    expect(d).toEqual({ title: 'Sample Pique Polo | Sample Brand', description: 'A classic polo.', practice: false, usage: { inputTokens: 64, outputTokens: 11 } });
    const w2 = liveAiWriter(async () => ({ text: '{"title": "x", "description": "y"}' }));
    expect((await w2.draftSeo(seoInput)).usage).toBeUndefined();
  });
});

describe('Anthropic (PR 306)', () => {
  it('sends the Messages API shape and reads its text content back', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const doFetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ content: [{ type: 'text', text: '{"title": "A title", "description": "A description."}' }] });
    });
    const complete = anthropicCompleter('sk-ant-secret', 'claude-x', 'https://api.anthropic.com', undefined, doFetch as unknown as typeof fetch);
    const r = await complete({ system: 'rules', user: 'write it', maxTokens: 100 });
    expect(r.text).toContain('A title');
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-secret');
    expect(headers['anthropic-version']).toBe(ANTHROPIC_DEFAULT_API_VERSION);
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({ model: 'claude-x', max_tokens: 100, system: 'rules' });
  });

  it('uses the owner\'s own api version override when one is set', async () => {
    const doFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2099-01-01');
      return jsonResponse({ content: [{ type: 'text', text: '{"title": "x", "description": "y"}' }] });
    });
    const complete = anthropicCompleter('sk-ant-secret', 'claude-x', 'https://api.anthropic.com', '2099-01-01', doFetch as unknown as typeof fetch);
    await complete({ system: '', user: 'x', maxTokens: 10 });
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it('throws without a key, exposes the key in no error, and is a LIVE-only AI_PROVIDER adapter', async () => {
    expect(anthropicAiWriterAdapter.kind).toBe('AI_PROVIDER');
    expect(anthropicAiWriterAdapter.modes).toEqual(['LIVE']);
    expect(anthropicAiWriterAdapter.secrets).toEqual(['apiKey']);
    await expect(anthropicAiWriterAdapter.create({ ...ctx(), secret: async () => null })).rejects.toThrow('key');
  });

  it('refuses and never repeats the key when Anthropic answers with an error', async () => {
    const doFetch = vi.fn(async () => jsonResponse({ error: { message: 'bad request' } }, 400));
    const complete = anthropicCompleter('sk-ant-secret', 'claude-x', 'https://api.anthropic.com', undefined, doFetch as unknown as typeof fetch);
    await expect(complete({ system: '', user: 'x', maxTokens: 10 })).rejects.toThrow('400');
  });

  // S15 · PR 325 — real token usage, for the usage ledger (recordAiUsage), passed through when Anthropic reports it.
  it('passes Anthropic\'s own input/output token counts through, and omits usage when it reports none', async () => {
    const doFetch = vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: '{"title": "x", "description": "y"}' }], usage: { input_tokens: 42, output_tokens: 7 } }));
    const complete = anthropicCompleter('sk-ant-secret', 'claude-x', 'https://api.anthropic.com', undefined, doFetch as unknown as typeof fetch);
    const r = await complete({ system: '', user: 'x', maxTokens: 10 });
    expect(r.usage).toEqual({ inputTokens: 42, outputTokens: 7 });
    const doFetch2 = vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: '{"title": "x", "description": "y"}' }] }));
    const complete2 = anthropicCompleter('sk-ant-secret', 'claude-x', 'https://api.anthropic.com', undefined, doFetch2 as unknown as typeof fetch);
    expect((await complete2({ system: '', user: 'x', maxTokens: 10 })).usage).toBeUndefined();
  });
});

describe('OpenAI-compatible (OpenAI, OpenRouter) (PR 306)', () => {
  it('sends the Chat Completions shape and reads the message content back', async () => {
    const doFetch = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ choices: [{ message: { content: '{"title": "x", "description": "y"}' } }] }));
    const complete = openAiCompatibleCompleter({ apiKey: 'sk-secret', model: 'gpt-x', baseUrl: 'https://api.openai.com/v1', fetch: doFetch as unknown as typeof fetch });
    const r = await complete({ system: 's', user: 'u', maxTokens: 50 });
    expect(r.text).toContain('"title"');
    const [url, init] = doFetch.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer sk-secret');
  });

  it('builds OpenRouter\'s optional attribution headers only from what the owner filled in', () => {
    expect(openRouterAttributionHeaders({ appUrl: 'https://shop.example.com', appName: 'EXTAS' })).toEqual({ 'HTTP-Referer': 'https://shop.example.com', 'X-Title': 'EXTAS' });
    expect(openRouterAttributionHeaders({})).toEqual({});
  });

  it('throws when the service refuses', async () => {
    const doFetch = vi.fn(async () => jsonResponse({ error: { message: 'no credit' } }, 402));
    const complete = openAiCompatibleCompleter({ apiKey: 'sk-secret', model: 'gpt-x', baseUrl: 'https://api.openai.com/v1', fetch: doFetch as unknown as typeof fetch });
    await expect(complete({ system: '', user: 'x', maxTokens: 10 })).rejects.toThrow('402');
  });

  // S15 · PR 325 — real prompt/completion token counts, for the usage ledger.
  it('passes the Chat Completions usage block through', async () => {
    const doFetch = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '{"title": "x", "description": "y"}' } }], usage: { prompt_tokens: 30, completion_tokens: 12 } }));
    const complete = openAiCompatibleCompleter({ apiKey: 'sk-secret', model: 'gpt-x', baseUrl: 'https://api.openai.com/v1', fetch: doFetch as unknown as typeof fetch });
    expect((await complete({ system: '', user: 'x', maxTokens: 10 })).usage).toEqual({ inputTokens: 30, outputTokens: 12 });
  });

  it('openAi and openRouter are both AI_PROVIDER LIVE adapters needing an apiKey', () => {
    for (const a of [openAiAiWriterAdapter, openRouterAiWriterAdapter]) {
      expect(a.kind).toBe('AI_PROVIDER');
      expect(a.modes).toEqual(['LIVE']);
      expect(a.secrets).toEqual(['apiKey']);
    }
  });
});

describe('Google AI (Gemini) (PR 306)', () => {
  it('sends generateContent\'s shape and reads the candidate text back', async () => {
    const doFetch = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ candidates: [{ content: { parts: [{ text: '{"title": "x", "description": "y"}' }] } }] }));
    const complete = googleAiCompleter('secret-key', 'gemini-x', 'https://generativelanguage.googleapis.com/v1beta', doFetch as unknown as typeof fetch);
    const r = await complete({ system: 's', user: 'u', maxTokens: 50 });
    expect(r.text).toContain('"title"');
    const [url, init] = doFetch.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
    expect(url).not.toContain('secret-key');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
  });

  it('throws when Google answers with no candidates', async () => {
    const doFetch = vi.fn(async () => jsonResponse({ candidates: [] }));
    const complete = googleAiCompleter('k', 'gemini-x', 'https://generativelanguage.googleapis.com/v1beta', doFetch as unknown as typeof fetch);
    await expect(complete({ system: '', user: 'x', maxTokens: 10 })).rejects.toThrow('no text');
  });

  // S15 · PR 325 — real prompt/candidate token counts, for the usage ledger.
  it('passes Gemini\'s own usageMetadata through', async () => {
    const doFetch = vi.fn(async () => jsonResponse({ candidates: [{ content: { parts: [{ text: '{"title": "x", "description": "y"}' }] } }], usageMetadata: { promptTokenCount: 18, candidatesTokenCount: 9 } }));
    const complete = googleAiCompleter('k', 'gemini-x', 'https://generativelanguage.googleapis.com/v1beta', doFetch as unknown as typeof fetch);
    expect((await complete({ system: '', user: 'x', maxTokens: 10 })).usage).toEqual({ inputTokens: 18, outputTokens: 9 });
  });

  it('is an AI_PROVIDER LIVE adapter needing an apiKey', () => {
    expect(googleAiWriterAdapter.kind).toBe('AI_PROVIDER');
    expect(googleAiWriterAdapter.modes).toEqual(['LIVE']);
    expect(googleAiWriterAdapter.secrets).toEqual(['apiKey']);
  });
});
