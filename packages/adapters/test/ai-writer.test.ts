// S11 · PR 221 — the practice AI writer: only the facts it was given, cut to the store's limits, marked as practice;
// no live mode, no key, not in Keys & connections until a provider comes.
import { describe, expect, it } from 'vitest';
import { aiWriterAdapters, allAdapters, cutTo, mockAiWriterAdapter, type AiSeoInput } from '../src';

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
