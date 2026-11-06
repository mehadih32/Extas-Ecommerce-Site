// PR 645 (CN-036) — the Reports section in the Lumen look: every page root is marked ready (so it follows dark
// mode), the section's styles hold no colour literal or font family and keep text at 14 px or more, and messages that
// the work went through use the one toast while approving or rejecting a fix keeps its confirmation.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAdmin, smallSizes, styleLiterals, unmarkedDenied, unreadyRoots } from '@/lib/admin-lumen/section-check';

const comp = (rel: string) => readFileSync(join(__dirname, '..', '..', 'components', 'admin', rel), 'utf8');
const HEALTH = ['', '/history', '/history/[id]', '/fixes', '/smoke', '/problems', '/problems/[id]', '/speed'].map((p) => `reports/health${p}/page.tsx`);

describe('Reports part 2: Site health in the Lumen look (PR 645)', () => {
  it.each(HEALTH)('%s: every page root is ready, the main one carries the section class', (p) => {
    const src = readAdmin(p);
    expect(unreadyRoots(src)).toEqual([]);
    expect(unmarkedDenied(src)).toEqual([]);
    expect(src).toMatch(/className="a2-z lm-rp" data-lm-ready=""/);
  });

  it('the section styles hold no colour literal or font family, and no text under 14 px', () => {
    expect(styleLiterals(readAdmin('lumen-reports.css'))).toEqual([]);
    expect(smallSizes(readAdmin('lumen-reports.css'))).toEqual([]);
    for (const css of ['reports/health/health.css', 'reports/health/problems/problems.css']) expect(styleLiterals(readAdmin(css)), css).toEqual([]);
    expect(readAdmin('layout.tsx')).toMatch(/import '\.\/lumen-reports\.css';/);
  });

  it('"Run now" and a problem\'s status use the one toast; a fix decision keeps its confirm step', () => {
    for (const f of ['settings/JourneysRun.tsx', 'settings/ProblemStatusForm.tsx']) {
      const src = comp(f);
      expect(src, f).toContain('showToast(');
      expect(src, f).not.toMatch(/bad: false/);
      expect(src, f).not.toContain('undo:');
    }
    expect(comp('settings/ProposalDecide.tsx')).toContain('ConfirmDialog');
  });
});
