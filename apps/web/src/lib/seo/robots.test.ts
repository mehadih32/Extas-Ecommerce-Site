// S11 · PR 229 — robots.txt: closed means everyone out; open keeps the admin, the API and a customer's pages (both
// languages) out, the search results while not listed, the owner's extra paths; AI robots in as shipped, out by name
// when switched off; the sitemap's address at the end.
import { describe, expect, it } from 'vitest';
import { SEO_ROBOTS_DEFAULT } from '@extas/settings';
import { closedPaths, robotsTxt } from './robots';

const open = { open: true, searchListed: false, sitemap: 'https://shop.example.test/sitemap.xml' };

describe('robots.txt (PR 229)', () => {
  it('keeps every robot out while the shop is closed (or on the preview)', () => {
    expect(robotsTxt(SEO_ROBOTS_DEFAULT, { ...open, open: false })).toBe('User-agent: *\nDisallow: /\n');
  });

  it('open: the admin, the API and a customer\'s pages stay out in both languages; the sitemap closes the file', () => {
    const txt = robotsTxt(SEO_ROBOTS_DEFAULT, open);
    for (const p of ['/admin', '/api/', '/erp-api/', '/bag', '/bn/bag', '/checkout', '/bn/checkout', '/account', '/bn/account', '/pay', '/search', '/bn/search']) expect(txt).toContain(`Disallow: ${p}\n`);
    expect(txt).toContain('Allow: /\n');
    expect(txt.trimEnd().endsWith('Sitemap: https://shop.example.test/sitemap.xml')).toBe(true);
    // AI robots read with everyone else as shipped (answer 56)
    expect(txt).not.toContain('GPTBot');
    expect(txt).not.toMatch(/^Disallow: \/$/m);
  });

  it('search results listed, extra paths, no sitemap', () => {
    const txt = robotsTxt({ ...SEO_ROBOTS_DEFAULT, disallow: ['/drafts/', '/bag'] }, { ...open, searchListed: true, sitemap: null });
    expect(txt).not.toContain('Disallow: /search');
    expect(txt).toContain('Disallow: /drafts/\n');
    expect(txt.match(/Disallow: \/bag\n/g)).toHaveLength(1);
    expect(txt).not.toContain('Sitemap:');
    expect(closedPaths(true)).not.toContain('/search');
  });

  it('AI switch off: each named robot gets its own group that keeps it out', () => {
    const txt = robotsTxt({ ...SEO_ROBOTS_DEFAULT, aiCrawlers: false }, open);
    for (const bot of SEO_ROBOTS_DEFAULT.aiBots) expect(txt).toContain(`\nUser-agent: ${bot}\nDisallow: /\n`);
  });
});
