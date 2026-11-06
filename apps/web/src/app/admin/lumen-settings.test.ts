// PR 647 (CN-036) — the Settings section in the Lumen look: every page root is marked ready (so it follows dark mode),
// the two .ad pages and the two embedded .ad cards too; the section's styles hold no colour literal or font family and
// keep text at 14 px or more; Admin look (PR 630) and Shimmer (PR 598) stay as they were built; messages that the work
// went through use the one toast, while removing a key and erasing a person's data keep their confirmation.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAdmin, smallSizes, styleLiterals, unmarkedDenied, unreadyRoots } from '@/lib/admin-lumen/section-check';

const PAGES = ['settings/store', 'settings/policies', 'settings/privacy', 'settings/security', 'settings/security/edge', 'settings/erp-link', 'settings/system/backups', 'settings/system/cache', 'settings/system/go-live'].map((p) => `${p}/page.tsx`);
const comp = (rel: string) => readFileSync(join(__dirname, '..', '..', 'components', 'admin', rel), 'utf8');

describe('Settings section in the Lumen look (PR 647)', () => {
  it.each(PAGES)('%s: every page root is ready and carries the section class', (p) => {
    const src = readAdmin(p);
    expect(unreadyRoots(src)).toEqual([]);
    expect(unmarkedDenied(src)).toEqual([]);
    expect(src).toMatch(/className="a2-z lm-st" data-lm-ready=""/);
  });

  it('Keys & connections and Server draw their .ad frame ready', () => {
    for (const p of ['integrations/page.tsx', 'server/page.tsx']) {
      expect(readAdmin(p), p).toMatch(/<AdminFrame view=\{view\} current=\{KEY\} ready>/);
      // the no-access state too (the deploy's read-only smoke account sees it)
      expect(readAdmin(p), p).toMatch(/kind === 'forbidden'\) return <AdminNotice [^>]*text=\{t\(view\.dict, 'page\.noAccess'\)\} ready \/>/);
    }
  });

  it('the cards embedded in the ERP link page follow it into dark mode', () => {
    for (const f of ['Integrations.tsx', 'ErpCalls.tsx']) expect(comp(f), f).toContain('<div className="ad ad-embed" data-lm-ready="">');
  });

  it('the section styles hold no colour literal or font family, and no text under 14 px', () => {
    expect(styleLiterals(readAdmin('lumen-settings.css'))).toEqual([]);
    expect(styleLiterals(readAdmin('settings/settings.css'))).toEqual([]);
    expect(smallSizes(readAdmin('lumen-settings.css'))).toEqual([]);
    expect(readAdmin('layout.tsx')).toMatch(/import '\.\/lumen-settings\.css';/);
  });

  it('messages go through the one toast; no screen keeps its own .ad-toast', () => {
    const keys = comp('Integrations.tsx');
    expect(keys).toContain('showToast(');
    expect(keys).not.toContain('ad-toast');
    expect(keys).toContain('window.confirm(');
    for (const f of ['settings/SecurityScreen.tsx', 'settings/PrivacyRequests.tsx', 'settings/EdgeSend.tsx']) {
      const src = comp(f);
      expect(src, f).toContain('showToast(');
      expect(src, f).not.toMatch(/bad: false/);
    }
    // erasing a person's data keeps its typed confirmation; nothing offers Undo here
    expect(comp('settings/PrivacyRequests.tsx')).toContain('ConfirmDialog');
    for (const f of ['Integrations.tsx', 'settings/SecurityScreen.tsx', 'settings/PrivacyRequests.tsx', 'settings/EdgeSend.tsx']) expect(comp(f), f).not.toContain('undo:');
  });

  it('a settings card (FieldsCard, every section) says "saved" through the one toast; a refusal stays beside Save (follow-up)', () => {
    const src = comp('settings/FieldsCard.tsx');
    expect(src).toContain("showToast({ text: x.saved, tone: 'ok' })");
    expect(src).not.toMatch(/bad: false/);
    expect(src).toMatch(/bad: true/);
    expect(src).not.toContain('undo:');
  });

  it('Admin look and Shimmer keep their own Lumen build', () => {
    expect(readAdmin('settings/look/page.tsx')).toContain('data-testid="admin-look" data-lm-ready=""');
    expect(readAdmin('settings/shimmer/page.tsx')).toContain('data-testid="sh-page" data-lm-ready=""');
  });
});
