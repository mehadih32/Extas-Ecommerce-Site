// S15 · PR 307 — the pure parts of the per-agent model pick: the option list's shape from a mocked `integration`
// table (no Postgres needed, unlike control-room.db.test.ts's end-to-end coverage) and `recommendedWriterOf`'s
// "Claude's own pick first" order.
import { describe, expect, it, vi } from 'vitest';
import { isWriterProvider, listWriterOptions, recommendedWriterOf, WRITER_PROVIDERS, type WriterOption } from './model-picks';

function dbWith(rows: Array<{ provider: string; enabled: boolean; mode: string; config: unknown }>) {
  return { integration: { findMany: vi.fn(async () => rows) } } as unknown as Parameters<typeof listWriterOptions>[0];
}

describe('isWriterProvider', () => {
  it('accepts exactly the four PR 306 providers', () => {
    for (const p of WRITER_PROVIDERS) expect(isWriterProvider(p)).toBe(true);
    expect(isWriterProvider('chatGpt')).toBe(false);
    expect(isWriterProvider('')).toBe(false);
  });
});

describe('listWriterOptions', () => {
  it('always lists the practice writer first, ready, with no model id', async () => {
    const options = await listWriterOptions(dbWith([]));
    expect(options[0]).toEqual({ provider: null, modelId: null, ready: true });
    expect(options).toHaveLength(5);
    expect(options.slice(1).every((o) => !o.ready)).toBe(true);
  });

  it('a provider is ready only when enabled AND mode is LIVE; its model id comes from the owner\'s own config', async () => {
    const options = await listWriterOptions(
      dbWith([
        { provider: 'anthropic', enabled: true, mode: 'LIVE', config: { model: 'claude-sonnet-5' } },
        { provider: 'openAi', enabled: true, mode: 'MOCK', config: { model: 'gpt-5' } }, // enabled but not Tested yet
        { provider: 'googleAi', enabled: false, mode: 'LIVE', config: { model: 'gemini-3' } }, // Tested once, now off
      ]),
    );
    expect(options.find((o) => o.provider === 'anthropic')).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-5', ready: true });
    expect(options.find((o) => o.provider === 'openAi')).toEqual({ provider: 'openAi', modelId: null, ready: false });
    expect(options.find((o) => o.provider === 'googleAi')).toEqual({ provider: 'googleAi', modelId: null, ready: false });
    expect(options.find((o) => o.provider === 'openRouter')).toEqual({ provider: 'openRouter', modelId: null, ready: false });
  });

  it('a missing or blank model id reads as null, never an empty string the page would render', async () => {
    const options = await listWriterOptions(dbWith([{ provider: 'anthropic', enabled: true, mode: 'LIVE', config: { model: '  ' } }]));
    expect(options.find((o) => o.provider === 'anthropic')?.modelId).toBeNull();
    const noConfig = await listWriterOptions(dbWith([{ provider: 'anthropic', enabled: true, mode: 'LIVE', config: null }]));
    expect(noConfig.find((o) => o.provider === 'anthropic')?.modelId).toBeNull();
  });
});

describe('recommendedWriterOf', () => {
  const opt = (provider: WriterOption['provider'], ready: boolean): WriterOption => ({ provider, modelId: null, ready });

  it('recommends nothing live until a provider is ready — the practice writer stands in', () => {
    expect(recommendedWriterOf([opt(null, true), opt('anthropic', false), opt('openAi', false)])).toBeNull();
  });

  it("recommends Claude's own model first, even when a later provider is also ready", () => {
    expect(recommendedWriterOf([opt(null, true), opt('anthropic', true), opt('openAi', true)])).toBe('anthropic');
  });

  it('falls through to the next ready provider in order when Anthropic is not ready', () => {
    expect(recommendedWriterOf([opt(null, true), opt('anthropic', false), opt('openAi', true), opt('googleAi', true)])).toBe('openAi');
  });
});
