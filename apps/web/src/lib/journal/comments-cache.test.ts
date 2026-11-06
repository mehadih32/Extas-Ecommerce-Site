// PR 251 follow-up (688) — showing or hiding a comment must reach the article at once. Nothing keeps an article page:
// the page renders on every request (`dynamic = 'force-dynamic'`, no server page cache in lib/cache.ts) and the proxy
// tells Cloudflare `no-store` for every journal address in both languages, even with the page cache on at its longest.
// So there is nothing to purge when a comment moves; this test fails the day an article page starts being kept, and
// that change must then purge the article when a comment is shown or hidden (moveComments, lib/journal/comments.ts).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { setProxyPolicy, shopCacheHeaders } from '../cache-policy';
import { hrefIn } from '../shop/lang';
import { ROUTES } from '../shop/routes';

const G = globalThis as unknown as { __extasCachePolicy?: unknown };
const page = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('a journal article is never kept, so a shown or hidden comment shows on the next view (PR 251, 688)', () => {
  afterEach(() => {
    delete G.__extasCachePolicy;
  });

  it('Cloudflare is told not to keep an article, a topic or the journal, in English and Bengali', () => {
    setProxyPolicy({ server: true, cdn: true, categoryMinutes: 1_440, productMinutes: 1_440, productPrefix: registry['naming.productPathPrefix'].default.replace(/\/+$/, '') });
    for (const lang of ['en', 'bn'] as const)
      for (const path of [ROUTES.article('linen-shirt-care'), ROUTES.journalTopic('care'), ROUTES.journal]) {
        expect(shopCacheHeaders(hrefIn(lang, path), []), `${lang} ${path}`).toEqual({ 'cache-control': null, 'cdn-cache-control': 'no-store' });
      }
  });

  it('the article page renders on every request and reads the shown comments itself', () => {
    const src = page('../../app/(shop)/(store)/journal/[slug]/page.tsx');
    expect(src).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(src).toMatch(/shownComments\(/);
    expect(src).not.toMatch(/unstable_cache|'use cache'|cachedProductPage|cachedCategoryPage|export const revalidate/);
  });
});
