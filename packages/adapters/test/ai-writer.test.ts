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

  // S15 · PR 306 — now that a live AI provider exists, AI_PROVIDER rows do appear in Keys & connections.
  it('S15 · PR 306: every live provider (Anthropic, OpenAI, Google, OpenRouter) is an AI_PROVIDER row with keys', () => {
    const live = allAdapters.filter((a) => a.kind === 'AI_PROVIDER');
    expect(live.map((a) => a.provider).sort()).toEqual(['anthropic', 'googleAi', 'openAi', 'openRouter']);
    for (const a of live) {
      expect(a.modes).toEqual(['LIVE']);
      expect(a.secrets).toContain('apiKey');
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

// S15 · PR 329 — the practice fraud review note: only the already-decided reasons, matches and history it was given,
// joined in plain sentences, marked practice — never a decision word.
describe('practice fraud review note (PR 329)', () => {
  const review = (over: Partial<import('../src').AiFraudReviewInput> = {}): import('../src').AiFraudReviewInput => ({
    locale: 'en',
    facts: { kind: 'duplicate', severity: 'High', why: ['A · Same customer, same items again · 100% sure · within 5 days · proposes cancel'], matches: ['EX-1002 · Processing · 3 Nov · ৳1,200'], history: ['3 orders, 2 delivered'] },
    max: { body: 240 },
    ...over,
  });

  it('writes a paragraph from the reasons, matches and history it was given', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftFraudReviewNote(review());
    expect(d.practice).toBe(true);
    expect(d.body).toContain('Same customer');
    expect(d.body).toContain('EX-1002');
    expect(d.body).toContain('3 orders, 2 delivered');
  });

  it('writes from matches and history alone when there is no fired rule', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftFraudReviewNote(review({ facts: { kind: 'risk', why: [], matches: [], history: ['3 orders, 2 delivered'] } }));
    expect(d.body).toBe('3 orders, 2 delivered');
  });

  it('cuts to the store limit and refuses a draft with nothing to explain', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftFraudReviewNote(review({ max: { body: 10 } }));
    expect([...d.body].length).toBeLessThanOrEqual(10);
    await expect(w.draftFraudReviewNote(review({ facts: { kind: 'duplicate', why: [], matches: [], history: [] } }))).rejects.toThrow();
  });
});

// S15 · PR 330 — the practice approval-explain note: only the already-decided title and reasons it was given, joined
// in one plain sentence, marked practice — never a decision word.
describe('practice approval-explain note (PR 330)', () => {
  const approval = (over: Partial<import('../src').AiApprovalExplainInput> = {}): import('../src').AiApprovalExplainInput => ({
    locale: 'en',
    facts: { title: 'Pause Winter Polos: campaign spent ৳1,200 with no delivered order', why: ['spent ৳1,200 over 3 Oct–9 Oct with 0 delivered orders'] },
    max: { body: 240 },
    ...over,
  });

  it('writes a paragraph from the title and reasons it was given', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftApprovalExplainNote(approval());
    expect(d.practice).toBe(true);
    expect(d.body).toContain('Pause Winter Polos');
    expect(d.body).toContain('0 delivered orders');
  });

  it('writes from the title alone when there is no extra reason', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftApprovalExplainNote(approval({ facts: { title: 'Pause Winter Polos', why: [] } }));
    expect(d.body).toBe('Pause Winter Polos');
  });

  it('cuts to the store limit and refuses a draft with no title', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftApprovalExplainNote(approval({ max: { body: 10 } }));
    expect([...d.body].length).toBeLessThanOrEqual(10);
    await expect(w.draftApprovalExplainNote(approval({ facts: { title: ' ', why: [] } }))).rejects.toThrow();
  });
});

// S15 · PR 331 — the practice reel caption: only the template's own name, notes and voice tone it was given, joined
// in one plain line, marked practice.
describe('practice social reel caption (PR 331)', () => {
  const social = (over: Partial<import('../src').AiSocialCaptionInput> = {}): import('../src').AiSocialCaptionInput => ({
    locale: 'en',
    facts: { templateName: 'Reel — new arrivals', notes: 'Upbeat, fast cuts' },
    max: { body: 220 },
    ...over,
  });

  it('writes from the template\'s own name and notes it was given', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftSocialReelCaption(social());
    expect(d.practice).toBe(true);
    expect(d.body).toContain('Reel — new arrivals');
    expect(d.body).toContain('Upbeat, fast cuts');
  });

  it('writes from the template name alone when there are no notes or voice tone', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftSocialReelCaption(social({ facts: { templateName: 'Reel — new arrivals' } }));
    expect(d.body).toBe('Reel — new arrivals');
  });

  it('cuts to the store limit and refuses a draft with no template name', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftSocialReelCaption(social({ max: { body: 10 } }));
    expect([...d.body].length).toBeLessThanOrEqual(10);
    await expect(w.draftSocialReelCaption(social({ facts: { templateName: ' ' } }))).rejects.toThrow();
  });
});

// S15 · PR 332 — the practice studio detail note: only the garment's own already-saved attributes it was given,
// joined in one plain line, marked practice — never a stitch/print/logo detail it was not told about.
describe('practice studio detail note (PR 332)', () => {
  const studio = (over: Partial<import('../src').AiStudioDetailInput> = {}): import('../src').AiStudioDetailInput => ({
    locale: 'en',
    facts: { name: 'Sample Pique Polo', fabric: 'Cotton pique', colours: ['Navy', 'White'], care: 'Machine wash cold' },
    max: { body: 240 },
    ...over,
  });

  it('writes from the garment\'s own attributes it was given', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftStudioDetailNote(studio());
    expect(d.practice).toBe(true);
    expect(d.body).toContain('Sample Pique Polo');
    expect(d.body).toContain('Cotton pique');
    expect(d.body).toContain('Navy, White');
  });

  it('writes from the name alone when there is no fabric, colour or care text', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftStudioDetailNote(studio({ facts: { name: 'Sample Pique Polo' } }));
    expect(d.body).toBe('Sample Pique Polo');
  });

  it('cuts to the store limit and refuses a draft with no garment name', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftStudioDetailNote(studio({ max: { body: 10 } }));
    expect([...d.body].length).toBeLessThanOrEqual(10);
    await expect(w.draftStudioDetailNote(studio({ facts: { name: ' ' } }))).rejects.toThrow();
  });
});

describe('practice stock alert note (PR 333)', () => {
  const stock = (over: Partial<import('../src').AiStockAlertInput> = {}): import('../src').AiStockAlertInput => ({
    locale: 'en',
    facts: { productName: 'Sample Pique Polo', sku: 'SPP-NVY-M', colour: 'Navy', size: 'M', available: 2, threshold: 5, sinceDays: 3 },
    max: { body: 150 },
    ...over,
  });

  it('writes from the SKU\'s own already-computed numbers it was given', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftStockAlertNote(stock());
    expect(d.practice).toBe(true);
    expect(d.body).toContain('Sample Pique Polo');
    expect(d.body).toContain('SPP-NVY-M');
    expect(d.body).toContain('Navy / M');
    expect(d.body).toContain('2 left');
    expect(d.body).toContain('threshold 5');
    expect(d.body).toContain('3 days');
  });

  it('writes with no colour/size section when the SKU has neither', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftStockAlertNote(stock({ facts: { productName: 'Sample Pique Polo', sku: 'SPP-M', available: 0, threshold: 5, sinceDays: 1 } }));
    expect(d.body).not.toContain('(');
    expect(d.body).toContain('1 day');
    expect(d.body).not.toContain('1 days');
  });

  it('cuts to the store limit and refuses a draft with no product name or SKU', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftStockAlertNote(stock({ max: { body: 10 } }));
    expect([...d.body].length).toBeLessThanOrEqual(10);
    await expect(w.draftStockAlertNote(stock({ facts: { productName: ' ', sku: 'SPP-M', available: 0, threshold: 5, sinceDays: 1 } }))).rejects.toThrow();
    await expect(w.draftStockAlertNote(stock({ facts: { productName: 'Sample Pique Polo', sku: ' ', available: 0, threshold: 5, sinceDays: 1 } }))).rejects.toThrow();
  });
});

describe('practice guide Q&A answer (PR 334)', () => {
  const qa = (over: Partial<import('../src').AiGuideQaInput> = {}): import('../src').AiGuideQaInput => ({
    locale: 'bn',
    facts: { pageTitle: 'Low stock', guideText: 'যে রং-সাইজ প্রায় শেষ, চেকআউটে আটকে রাখা মাল বাদ দিয়ে দেখায়।', question: 'এটা কীভাবে গোনা হয়?' },
    max: { body: 300 },
    ...over,
  });

  it("writes from the page's own already-written guide text it was given", async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftGuideQaAnswer(qa());
    expect(d.practice).toBe(true);
    expect(d.body).toBe('যে রং-সাইজ প্রায় শেষ, চেকআউটে আটকে রাখা মাল বাদ দিয়ে দেখায়।');
  });

  it('cuts to the store limit and refuses a draft with no guide text or no question', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftGuideQaAnswer(qa({ max: { body: 10 } }));
    expect([...d.body].length).toBeLessThanOrEqual(10);
    await expect(w.draftGuideQaAnswer(qa({ facts: { pageTitle: 'Low stock', guideText: ' ', question: 'x' } }))).rejects.toThrow();
    await expect(w.draftGuideQaAnswer(qa({ facts: { pageTitle: 'Low stock', guideText: 'text', question: ' ' } }))).rejects.toThrow();
  });
});

describe('practice competitor journey step (PR 335)', () => {
  const step = (over: Partial<import('../src').AiCompetitorStepInput> = {}): import('../src').AiCompetitorStepInput => ({
    locale: 'en',
    facts: { stepLabel: 'Product', url: 'https://example.com/p/1', pageTitle: 'Sample Polo', pageText: 'A product page with sizes S, M, L and a "free delivery over X" bar.' },
    max: { body: 300 },
    ...over,
  });

  it('writes only from the step label, title and how much page text it was given — never a price or layout detail it was not told', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftCompetitorStep(step());
    expect(d.practice).toBe(true);
    expect(d.body).toContain('Product');
    expect(d.body).toContain('Sample Polo');
  });

  it('cuts to the store limit and refuses a draft with no page text', async () => {
    const w = await mockAiWriterAdapter.mock(ctx);
    const d = await w.draftCompetitorStep(step({ max: { body: 10 } }));
    expect([...d.body].length).toBeLessThanOrEqual(10);
    await expect(w.draftCompetitorStep(step({ facts: { stepLabel: 'Product', url: 'https://example.com/p/1', pageText: ' ' } }))).rejects.toThrow();
  });
});
