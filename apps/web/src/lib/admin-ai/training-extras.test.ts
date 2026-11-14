// S28 · PR 713 — the pure parts of the Training extras: the sandbox text, the version number kept in a document row, the cleaner, and the
// rule that "Try it" never reaches a model while AI is off.
import { describe, expect, it, vi } from 'vitest';
import { clean, docVersionOf, sandboxFacts, tryIt } from './training-extras';

describe('docVersionOf', () => {
  it('reads doc:<n>, else 1', () => {
    expect(docVersionOf('doc:3')).toBe(3);
    expect(docVersionOf('doc:1')).toBe(1);
    expect(docVersionOf(null)).toBe(1);
    expect(docVersionOf('sandbox')).toBe(1);
  });
});

describe('clean', () => {
  it('trims, drops carriage returns and ignores non-text', () => {
    expect(clean('  a\r\nb  ')).toBe('a\nb');
    expect(clean(5)).toBe('');
    expect(clean(undefined)).toBe('');
  });
});

describe('sandboxFacts', () => {
  it('lists instructions, forbidden topics and documents', () => {
    const t = sandboxFacts({ agentName: 'Dut', lines: ['Be short'], forbidden: ['politics'], docs: [{ title: 'Returns', text: '7 days' }] });
    expect(t).toContain('Agent: Dut');
    expect(t).toContain('- Be short');
    expect(t).toContain('- politics');
    expect(t).toContain('Reference note "Returns":\n7 days');
  });
  it('has only the agent line when nothing is taught', () => {
    expect(sandboxFacts({ agentName: 'Dut', lines: [], forbidden: [], docs: [] })).toBe('Agent: Dut');
  });
});

describe('tryIt with AI off', () => {
  it('answers `off` and touches neither the database nor a model', async () => {
    const db = new Proxy({}, { get: () => { throw new Error('db must not be used while AI is off'); } });
    const value = vi.fn(async () => false);
    const r = await tryIt({ db: db as never, resolver: { value } as never, vault: null }, { agent: 'all', sample: 'Hello' }, (k) => k, 'en');
    expect(r).toEqual({ status: 'off' });
    expect(value).toHaveBeenCalledWith('ai.enabled', expect.anything());
  });
  it('refuses an empty sample or an unknown agent before anything else', async () => {
    const deps = { db: {} as never, resolver: { value: vi.fn() } as never, vault: null };
    await expect(tryIt(deps, { agent: 'all', sample: '  ' }, (k) => k, 'en')).rejects.toThrow();
    await expect(tryIt(deps, { agent: 'nobody', sample: 'x' }, (k) => k, 'en')).rejects.toThrow();
  });
});
