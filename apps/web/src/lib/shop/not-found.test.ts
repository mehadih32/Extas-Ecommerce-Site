// S11 · PR 235 follow-up — a shop page that answers "page not found" counts the address once, with the page that
// linked to it; the not-found page itself counts nothing (Next draws it with every shop page); every shop page uses
// the helper, never Next's notFound() alone.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const recorded: Array<[number, string, string | null]> = [];
vi.mock('@/lib/seo/not-found', () => ({ recordNotFound: (s: number, p: string, r: string | null) => recorded.push([s, p, r]) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ referer: 'https://elsewhere.example/blog' }) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  },
}));

const { shopNotFound } = await import('./not-found');
const SRC = join(__dirname, '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('the shop answers "page not found" (PR 235 follow-up)', () => {
  it('counts the address with the linking page, then throws Next`s not-found', async () => {
    recorded.length = 0;
    expect(() => shopNotFound({ storeId: 2, path: '/p/gone' })).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    await new Promise((r) => setTimeout(r, 0));
    expect(recorded).toEqual([[2, '/p/gone', 'https://elsewhere.example/blog']]);
  });

  it('the not-found page itself counts nothing (it is drawn with every shop page)', () => {
    const page = readFileSync(join(SRC, 'app', '(shop)', '(store)', 'not-found.tsx'), 'utf8');
    expect(page).not.toMatch(/recordNotFound\(/);
  });

  it('every shop page answers through shopNotFound, never Next`s notFound() alone', () => {
    const shop = [...files(join(SRC, 'app', '(shop)')), ...files(join(SRC, 'components', 'shop'))];
    const bare = shop.filter((f) => readFileSync(f, 'utf8').split('\n').some((l) => !l.trim().startsWith('//') && /\bnotFound\(\)/.test(l)));
    expect(bare).toEqual([]);
  });
});
