// PR 718 — Website › Policies: the tab is in the menu (and off the awaiting list), its words match in both languages with
// Western digits, every new button / field word the editor reads exists, the shop reads the new pages from the history and
// the sitemap lists only published ones, and the page and the API follow the screen rules (permissions checked, no
// colour or size written in the page, inputs 16px and taps 44px in the style file).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import bn from '../../../messages/admin-website-policies.bn.json';
import en from '../../../messages/admin-website-policies.en.json';
import { AWAITING } from '../admin-shell/nav-v5';
import { SHELL_SECTIONS } from '../admin-shell/sections';
import { ADMIN_WORD_FILES } from '../website/admin-words';
import { POLICY_SLUGS } from './model';

const SRC = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const flat = (o: Record<string, unknown>, p = ''): Record<string, string> =>
  Object.entries(o).reduce<Record<string, string>>((a, [k, v]) => (typeof v === 'string' ? { ...a, [p + k]: v } : { ...a, ...flat(v as Record<string, unknown>, `${p}${k}.`) }), {});

describe('Website › Policies (PR 718)', () => {
  it('is a tab of Website and no longer awaited', () => {
    const website = SHELL_SECTIONS.find((s) => s.id === 'website')!;
    const tab = website.tabs.find((t) => t.id === 'policies')!;
    expect(tab.pages[0]).toMatchObject({ href: '/admin/website/policies', perm: 'website.read', keys: ['websitePolicies'] });
    expect(AWAITING).not.toContain('website.policies');
  });

  it('has the same words in English and Bengali, Western digits only, and joins the admin words files', () => {
    const e = flat(en);
    const b = flat(bn);
    expect(Object.keys(b).sort()).toEqual(Object.keys(e).sort());
    for (const v of Object.values(b)) expect(v).not.toMatch(/[০-৯]/);
    for (const v of Object.values(b)) expect(v.trim()).not.toBe('');
    expect(ADMIN_WORD_FILES['admin-website-policies']).toBeTruthy();
  });

  it('names every page, state, version status, source, error and field the editor reads', () => {
    const e = flat(en);
    for (const s of POLICY_SLUGS) expect(e[`pw.names.${s}`]).toBeTruthy();
    for (const k of ['published', 'published-draft', 'draft']) expect(e[`pw.state.${k}`]).toBeTruthy();
    for (const k of ['PUBLISHED', 'DRAFT', 'SUPERSEDED', 'DISCARDED']) expect(e[`pw.vs.${k}`]).toBeTruthy();
    for (const k of ['settings', 'edit', 'restore']) expect(e[`pw.src.${k}`]).toBeTruthy();
    for (const k of ['INVALID_INPUT', 'STALE', 'PLACEHOLDER', 'UNKNOWN_TOKEN', 'NO_DRAFT', 'NOT_FOUND', 'forbidden', 'unauthorized', 'network', 'other']) expect(e[`pw.err.${k}`]).toBeTruthy();
    const tab = read('components/admin/website/PoliciesTab.tsx');
    for (const m of tab.matchAll(/\bw\['([A-Za-z.-]+)'\]/g)) expect(e[`pw.${m[1]}`], `pw.${m[1]}`).toBeTruthy();
  });

  it('keeps the screen rules: styles in tokens, inputs 16px, taps 44px', () => {
    const css = read('app/admin/website/policies/policies.css');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toMatch(/min-height:44px/);
    expect(css).toMatch(/font-size:16px/);
    expect(css).not.toMatch(/font-size:1[0-5](\.\d+)?px/);
  });

  it('checks permissions in the API and the service (`website.read` to see, `settings.write` to change)', () => {
    const svc = read('lib/website-policies/service.ts');
    expect(svc).toContain("'website.read'");
    expect(svc).toContain("'settings.write'");
    expect(read('lib/website-policies/api.ts')).toContain("permission: 'website.read'");
  });

  it('is read by the shop from the history, and the sitemap lists only published pages', () => {
    expect(read('app/(shop)/(store)/help/[slug]/page.tsx')).toContain('livePolicyWords');
    const sm = read('lib/seo/sitemap-data.ts');
    expect(sm).toContain('liveNewPolicies');
    expect(read('lib/website-policies/shop.ts')).toContain("status: 'PUBLISHED'");
  });
});
