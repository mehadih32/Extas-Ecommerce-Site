// CN-053 — a tab from before a deploy that asks for a file of the old build reloads ONCE, with an "Updating…" line, and
// can never loop; other errors are left alone.
import { describe, expect, it } from 'vitest';
import { CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS, installChunkRecovery, isChunkError, mayReloadForChunk } from './chunk-recovery';

function fakeWin(opts: { lang?: string; storageThrows?: boolean; stored?: string } = {}) {
  const listeners = new Map<string, (e: unknown) => void>();
  const store = new Map<string, string>(opts.stored ? [[CHUNK_RELOAD_KEY, opts.stored]] : []);
  const added: Array<{ role?: string; text: string | null }> = [];
  let reloads = 0;
  const win = {
    addEventListener: (t: string, f: (e: never) => void) => void listeners.set(t, f as (e: unknown) => void),
    removeEventListener: (t: string) => void listeners.delete(t),
    sessionStorage: {
      getItem: (k: string) => {
        if (opts.storageThrows) throw new Error('denied');
        return store.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (opts.storageThrows) throw new Error('denied');
        store.set(k, v);
      },
    },
    location: { reload: () => void (reloads += 1) },
    document: {
      documentElement: { lang: opts.lang ?? 'en' },
      body: { appendChild: (n: { textContent: string | null }) => void added.push({ text: n.textContent }) },
      createElement: () => {
        const el = { textContent: null as string | null, setAttribute: () => undefined };
        return el;
      },
    },
  };
  return { win, listeners, added, reloads: () => reloads, store };
}
const WORDS = { bn: 'আপডেট হচ্ছে…', en: 'Updating…' };

describe('chunk errors', () => {
  it('knows the errors of a missing old-build file', () => {
    for (const e of [new Error('Loading chunk 123 failed.'), Object.assign(new Error('x'), { name: 'ChunkLoadError' }), 'Failed to fetch dynamically imported module: https://x/_next/a.js', new Error('Importing a module script failed.'), { message: 'Loading CSS chunk 9 failed' }]) expect(isChunkError(e)).toBe(true);
    for (const e of [new Error('Cannot read properties of undefined'), 'boom', null, undefined, 42]) expect(isChunkError(e)).toBe(false);
  });
  it('allows a reload once per window', () => {
    expect(mayReloadForChunk(null, 1000)).toBe(true);
    expect(mayReloadForChunk('1000', 1000 + CHUNK_RELOAD_WINDOW_MS - 1)).toBe(false);
    expect(mayReloadForChunk('1000', 1000 + CHUNK_RELOAD_WINDOW_MS + 1)).toBe(true);
    expect(mayReloadForChunk('junk', 5)).toBe(true);
  });
});

describe('the old-build tab', () => {
  it('a failed chunk reloads once and shows the Updating line in the page language; a second one does not', () => {
    const f = fakeWin({ lang: 'bn' });
    installChunkRecovery(f.win as never, WORDS, () => 5000);
    f.listeners.get('unhandledrejection')!({ reason: new Error('Loading chunk 7 failed.') });
    f.listeners.get('error')!({ error: new Error('ChunkLoadError: x') });
    expect(f.reloads()).toBe(1);
    expect(f.added).toEqual([{ text: WORDS.bn }]);
  });
  it('after a reload that did not mend it (the guard is already set) it does not loop', () => {
    const f = fakeWin({ stored: '5000' });
    installChunkRecovery(f.win as never, WORDS, () => 6000);
    f.listeners.get('error')!({ error: new Error('Loading chunk 7 failed.') });
    expect(f.reloads()).toBe(0);
  });
  it('storage refused: never reloads by itself', () => {
    const f = fakeWin({ storageThrows: true });
    installChunkRecovery(f.win as never, WORDS);
    f.listeners.get('error')!({ error: new Error('Loading chunk 7 failed.') });
    expect(f.reloads()).toBe(0);
  });
  it('other errors do nothing; stopping removes the listeners', () => {
    const f = fakeWin();
    const stop = installChunkRecovery(f.win as never, WORDS);
    f.listeners.get('error')!({ error: new Error('TypeError: x is not a function') });
    expect(f.reloads()).toBe(0);
    stop();
    expect(f.listeners.size).toBe(0);
  });
});
