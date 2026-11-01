// S11 · PR 221 — the practice AI writer: only the facts it was given, cut to the store's limits, marked as practice;
// no live mode, no key, not in Keys & connections until a provider comes.
import { describe, expect, it } from 'vitest';
import { aiWriterAdapters, allAdapters, cutTo, mockAiWriterAdapter, type AiCampaignInput, type AiSeoInput } from '../src';

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

  it('has no live mode, no key, and stays out of Keys & connections until a provider comes', async () => {
    expect(mockAiWriterAdapter.modes).toEqual([]);
    expect(mockAiWriterAdapter.secrets).toEqual([]);
    expect(aiWriterAdapters).toContain(mockAiWriterAdapter);
    expect(allAdapters.some((a) => a.kind === 'AI_PROVIDER')).toBe(false);
    await expect(mockAiWriterAdapter.create(ctx)).rejects.toThrow();
    expect(await mockAiWriterAdapter.test(await mockAiWriterAdapter.mock(ctx), ctx)).toMatchObject({ ok: true });
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
