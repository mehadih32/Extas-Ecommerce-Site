// S11 · PR 221 — the practice AI writer: only the facts it was given, cut to the store's limits, marked as practice;
// no live mode, no key, not in Keys & connections until a provider comes.
import { describe, expect, it } from 'vitest';
import { aiWriterAdapters, allAdapters, cutTo, mockAiWriterAdapter, practiceArticle, type AiArticleInput, type AiCampaignInput, type AiSeoInput } from '../src';

const ctx = { mode: 'MOCK' as const, config: {}, storeId: 1, secret: async () => null };
const input = (over: Partial<AiSeoInput['facts']> = {}, max = { title: 60, description: 155 }): AiSeoInput => ({
  subject: 'product',
  locale: 'en',
  facts: { name: 'Sample Pique Polo', brand: 'Sample Brand', category: 'Polos', colours: ['Navy', 'White'], fit: 'Regular fit', shop: 'Sample Shop', ...over },
  max,
});

describe('practice AI writer (PR 221)', () => {
  it('writes only the facts it was given, in order', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftSeo(input());
    expect(d).toEqual({ title: 'Sample Pique Polo | Sample Brand | Sample Shop', description: 'Sample Pique Polo · Polos. Navy, White. Regular fit. Sample Shop', practice: true });
    // a brand the name already says is not said twice; empty facts leave no gap
    const e = await w.draftSeo(input({ brand: 'Sample', colours: [], fit: ' ' }));
    expect(e.title).toBe('Sample Pique Polo | Sample Shop');
    expect(e.description).toBe('Sample Pique Polo · Polos. Sample Shop');
  });

  it('keeps to the store limits, cutting at a word', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftSeo(input({}, { title: 20, description: 30 }));
    expect([...d.title].length).toBeLessThanOrEqual(20);
    expect([...d.description].length).toBeLessThanOrEqual(30);
    expect(d.title).toBe('Sample Pique Polo');
    expect(cutTo('একটি নীল পোলো শার্ট', 8)).toBe('একটি নীল');
    expect(cutTo('short', 10)).toBe('short');
  });

  it('refuses a page with no name', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    await expect(w.draftSeo(input({ name: ' ' }))).rejects.toThrow();
  });

  it('has no live mode, no key, and stays out of Keys & connections on its own', async () => {
    expect(mockAiWriterAdapter.modes).toEqual([]);
    expect(mockAiWriterAdapter.secrets).toEqual([]);
    expect(aiWriterAdapters).toContain(mockAiWriterAdapter);
    await expect(mockAiWriterAdapter.create(ctx)).rejects.toThrow();
    expect(await mockAiWriterAdapter.test(await mockAiWriterAdapter.mock(ctx), ctx)).toMatchObject({ ok: true });
  });

  // S15 · PR 306 — now that a live AI provider exists, AI_PROVIDER rows do appear in Keys & connections. S24 · PR
  // 449 adds its own AI_PROVIDER-kind adapters (FASHN, Fitroom) for the Photoshoot Studio — a different family
  // behind the same Keys & connections kind, so this checks the AI writer's own list, not every AI_PROVIDER row.
  it('S15 · PR 306: every live AI writer (Anthropic, OpenAI, Google, OpenRouter) is an AI_PROVIDER row with keys', () => {
    const live = aiWriterAdapters.filter((a) => a.modes.length > 0);
    expect(live.map((a) => a.provider).sort()).toEqual(['anthropic', 'googleAi', 'openAi', 'openRouter']);
    for (const a of live) {
      expect(a.kind).toBe('AI_PROVIDER');
      expect(a.modes).toEqual(['LIVE']);
      expect(a.secrets).toContain('apiKey');
      expect(allAdapters).toContain(a);
    }
  });
});

// S14 · PR 293 — the practice campaign writer: 2–3 versions from the owner's own words only, within the limits, the
// {words} whole, nothing it was not given.
describe('practice campaign writer (PR 293)', () => {
  const camp = (over: Partial<AiCampaignInput> = {}): AiCampaignInput => ({
    channel: 'email',
    locale: 'en',
    brief: 'New winter polos are in. Ten colours, all sizes.',
    voice: { greeting: 'Dear', signOff: 'Sample Shop team', style: 'friendly, short' },
    versions: 3,
    words: ['customerName', 'storeName', 'link'],
    max: { subject: 150, body: 2000 },
    ...over,
  });

  it('writes three e-mail versions from the greeting, the brief, the link word and the sign-off', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftCampaign(camp());
    expect(d.practice).toBe(true);
    expect(d.versions).toEqual([
      { subject: 'New winter polos are in.', body: 'Dear {customerName},\n\nNew winter polos are in. Ten colours, all sizes.\n\n{link}\n\nSample Shop team' },
      { subject: '{storeName}: New winter polos are in.', body: 'New winter polos are in. Ten colours, all sizes.\n\n{link}' },
      { subject: '{customerName}, New winter polos are in.', body: 'Dear {customerName},\n\nNew winter polos are in.\n\n{link}\n\nSample Shop team\n{storeName}' },
    ]);
  });

  it('keeps an SMS within its length, the {words} whole, and uses only the words allowed', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftCampaign(camp({ channel: 'sms', locale: 'bn', brief: 'শীতের নতুন পোলো এসেছে, দশটা রঙে, সব সাইজে পাওয়া যাচ্ছে এখনই দেখুন', voice: { greeting: 'প্রিয়', signOff: '', style: '' }, versions: 2, words: ['customerName'], max: { subject: 0, body: 50 } }));
    expect(d.versions).toHaveLength(2);
    for (const v of d.versions) {
      expect(v.subject).toBeUndefined();
      expect([...v.body].length).toBeLessThanOrEqual(50);
      expect(v.body).not.toMatch(/\{(?!customerName\})/u);
      expect(v.body).not.toContain('{link}');
    }
    expect(d.versions[0]!.body.startsWith('প্রিয় {customerName}, শীতের')).toBe(true);
  });

  it('gives each version once when the owner has no greeting or sign-off yet, and refuses an empty brief', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftCampaign(camp({ voice: { greeting: '', signOff: '', style: '' }, words: ['link'] }));
    expect(new Set(d.versions.map((v) => `${v.subject}|${v.body}`)).size).toBe(d.versions.length);
    await expect(w.draftCampaign(camp({ brief: '  ' }))).rejects.toThrow();
  });
});

describe('practice article writer (PR 243)', () => {
  const brief: AiArticleInput = {
    locale: 'bn',
    title: 'পোলোর কলার কেন কুঁচকায়',
    query: 'পোলো কলার কুঁচকানো',
    keywords: ['পোলো কলার', 'পোলোর যত্ন'],
    intent: 'howto',
    wordCount: 900,
    outline: ['কেন হয়', 'কী করবেন'],
    mustInclude: 'ঠান্ডা পানিতে ধোবেন\nউল্টো করে শুকাবেন',
    links: ['/collections/polos', 'https://example.com/x'],
    notes: 'সহজ ভাষায়',
  };

  it('writes only the brief’s words, in the editor’s format, and says it is practice', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftArticle(brief);
    expect(d.practice).toBe(true);
    expect(d.excerpt).toBe('পোলো কলার কুঁচকানো');
    expect(d.body.split('\n\n')).toEqual([
      'পোলো কলার কুঁচকানো',
      '- ঠান্ডা পানিতে ধোবেন\n- উল্টো করে শুকাবেন',
      '## কেন হয়',
      'পোলো কলার কুঁচকানো',
      '## কী করবেন',
      'পোলো কলার কুঁচকানো',
      '- [/collections/polos](/collections/polos)',
      'পোলো কলার · পোলোর যত্ন',
      '> note: সহজ ভাষায়',
    ]);
    expect(practiceArticle({ ...brief, query: null, mustInclude: null, outline: [], links: [], notes: null }).body).toBe('পোলোর কলার কেন কুঁচকায়\n\nপোলো কলার · পোলোর যত্ন');
  });

  it('refuses to write without a brief', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    await expect(w.draftArticle({ ...brief, keywords: [] })).rejects.toThrow('brief');
    await expect(w.draftArticle({ ...brief, title: ' ' })).rejects.toThrow('brief');
  });
});

// S15 · PR 325 — the practice support reply: the store's own rule-based words, unchanged, marked practice.
describe('practice support reply (PR 325)', () => {
  const reply = (over: Partial<import('../src').AiSupportReplyInput> = {}): import('../src').AiSupportReplyInput => ({
    locale: 'en',
    question: 'where is my order',
    facts: { intent: 'status', orderNumber: 'EX1', orderStatus: 'IN_TRANSIT' },
    ruleBasedBody: 'Hi Rahim, order EX1 is on its way.',
    max: { body: 300 },
    ...over,
  });

  it('answers with the rule-based body, unchanged, marked practice', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftSupportReply(reply());
    expect(d).toEqual({ body: 'Hi Rahim, order EX1 is on its way.', practice: true });
  });

  it('cuts to the store limit and refuses an empty draft', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftSupportReply(reply({ max: { body: 10 } }));
    expect([...d.body].length).toBeLessThanOrEqual(10);
    await expect(w.draftSupportReply(reply({ ruleBasedBody: ' ' }))).rejects.toThrow();
  });
});

// S15 · PR 326 — the practice product description: only the product's own attributes, joined in order, marked practice.
describe('practice product description (PR 326)', () => {
  const desc = (over: Partial<import('../src').AiProductDescriptionInput> = {}): import('../src').AiProductDescriptionInput => ({
    locale: 'en',
    facts: { name: 'Sample Pique Polo', brand: 'Sample Brand', category: 'Polos', colours: ['Navy', 'White'], sizes: ['S', 'M', 'L'], fabric: 'Cotton pique', care: 'Machine wash cold.', shop: 'Sample Shop' },
    max: { body: 900 },
    ...over,
  });

  it('writes only the attributes it was given, in order', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftProductDescription(desc());
    expect(d).toEqual({ body: 'Sample Pique Polo · Polos. Navy, White. Sizes: S, M, L. Cotton pique. Machine wash cold.. Sample Shop', practice: true });
  });

  it('leaves no gap for an attribute that was not given', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftProductDescription(desc({ facts: { name: 'Plain Tee' } }));
    expect(d.body).toBe('Plain Tee');
  });

  it('cuts to the store limit and refuses a draft with no product name', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftProductDescription(desc({ max: { body: 10 } }));
    expect([...d.body].length).toBeLessThanOrEqual(10);
    await expect(w.draftProductDescription(desc({ facts: { name: ' ' } }))).rejects.toThrow();
  });
});

// S15 · PR 328 — the practice size advice: only the recommendation's own measurements, in one plain sentence, marked practice.
describe('practice size advice (PR 328)', () => {
  const advice = (over: Partial<import('../src').AiSizeAdviceInput> = {}): import('../src').AiSizeAdviceInput => ({
    locale: 'en',
    facts: { sizeLabel: 'L', fieldLabel: 'Chest', valueInch: 44, needInch: 42, bodyInch: 40, easeInch: 2, covered: true, heightIn: 67, weightKg: 68 },
    max: { body: 240 },
    ...over,
  });

  it('writes a covered answer from the measurements it was given', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftSizeAdvice(advice());
    expect(d).toEqual({ body: 'Size L: its chest of 44" covers your estimated need of 42" (body 40" + 2" ease).', practice: true });
  });

  it('writes the honest "largest size" answer when the chart does not cover the need', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftSizeAdvice(advice({ facts: { sizeLabel: 'XXL', fieldLabel: 'Chest', valueInch: 46, needInch: 48, bodyInch: 46, easeInch: 2, covered: false, heightIn: 72, weightKg: 95 } }));
    expect(d.body).toContain('largest size');
    expect(d.body).not.toContain('covers');
  });

  it('cuts to the store limit and refuses a draft with no recommended size', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftSizeAdvice(advice({ max: { body: 10 } }));
    expect([...d.body].length).toBeLessThanOrEqual(10);
    await expect(w.draftSizeAdvice(advice({ facts: { ...advice().facts, sizeLabel: ' ' } }))).rejects.toThrow();
  });
});
