import { describe, expect, it } from 'vitest';
import { blockers, goLiveRows, onBase, reportMarkdown, sitemapLocs, targetProblem } from './golive-check.mjs';

describe('golive-check (PR 587)', () => {
  it('reads every loc of a sitemap index and a urlset, unescaped', () => {
    const xml = '<sitemapindex><sitemap><loc>https://a.test/sitemaps/products-1.xml</loc></sitemap><sitemap><loc> https://a.test/x?a=1&amp;b=2 </loc></sitemap></sitemapindex>';
    expect(sitemapLocs(xml)).toEqual(['https://a.test/sitemaps/products-1.xml', 'https://a.test/x?a=1&b=2']);
  });
  it('asks only the staging host, whatever host the file names', () => {
    expect(onBase('https://staging.test', 'https://main.test/p/x?c=1')).toBe('https://staging.test/p/x?c=1');
    expect(onBase('https://staging.test', '/api/admin/go-live')).toBe('https://staging.test/api/admin/go-live');
  });
  it('orders the rows Needed before first, keeps only short values, finds what is open', () => {
    const rows = goLiveRows(
      { items: [
        { key: 'ownerData', pr: 399, kind: 'auto', when: 'after', ok: false, vars: { stores: 1, missing: 'x' } },
        { key: 'smoke', pr: 393, kind: 'auto', when: 'before', ok: true, vars: { pages: 406, blob: { a: 1 } } },
        { key: 'runbook', pr: 398, kind: 'signoff', when: 'before', ok: false },
      ] },
      { smoke: 'Every page opens' },
    );
    expect(rows.map((r) => r.key)).toEqual(['smoke', 'runbook', 'ownerData']);
    expect(rows[0]).toMatchObject({ title: 'Every page opens', vars: { pages: 406 } });
    expect(blockers(rows).map((r) => r.key)).toEqual(['runbook']);
    expect(goLiveRows(null)).toEqual([]);
  });
  it('a target must open with 200 and never forward again', () => {
    expect(targetProblem('/p/a', 200)).toBeNull();
    expect(targetProblem('/p/a', 301, '/p/b')).toMatch(/chain/);
    expect(targetProblem('/p/a', 404)).toMatch(/404/);
  });
  it('the report names both groups and says nothing was changed', () => {
    const md = reportMarkdown({
      at: 'now', sha: 'abc', ok: false, problems: [],
      goLive: { rows: goLiveRows({ items: [{ key: 'smoke', pr: 393, kind: 'auto', when: 'before', ok: true }, { key: 'telegram', pr: 400, kind: 'auto', when: 'after', ok: false }] }), blockers: [] },
      redirects: { rows: 0, live: false, expected: 49, checked: 0, problems: ['none yet'] },
      sitemap: { indexStatus: 200, files: 1, urls: 3, hosts: ['staging.test'], checked: 3, problems: [] },
      switch: { ok: true, detail: 'validated in a copy' },
    });
    expect(md).toContain('Needed before go-live (1/1 done)');
    expect(md).toContain('Soon after go-live (0/1 done');
    expect(md).toContain('Nothing was changed');
    expect(md).toContain('validated in a copy');
  });
});
