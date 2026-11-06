// PR 648 (CN-036) — the Help section in the Lumen look: every page root is marked ready (so it follows dark mode), its
// styles hold no colour literal or font family, the section's own Lumen rules keep text at 14 px or more, and a report
// or a status change speaks through the one toast.
import { describe, expect, it } from 'vitest';
import { readAdmin, smallSizes, styleLiterals, unmarkedDenied, unreadyRoots } from '@/lib/admin-lumen/section-check';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = ['help/page.tsx', 'help/manual/page.tsx', 'build/page.tsx', 'build/pr/[n]/page.tsx', 'build/problems/page.tsx', 'build/files/page.tsx', 'build/files/read/page.tsx', 'build/requests/page.tsx'];

describe('Help section in the Lumen look (PR 648)', () => {
  it.each(PAGES)('%s: every page root is ready', (p) => {
    const src = readAdmin(p);
    expect(src).toContain('data-lm-ready');
    expect(unreadyRoots(src)).toEqual([]);
    expect(unmarkedDenied(src)).toEqual([]);
  });

  it('the section styles hold no colour literal or font family', () => {
    for (const css of ['lumen-help.css', 'help/manual/manual.css', 'build/build.css']) expect(styleLiterals(readAdmin(css)), css).toEqual([]);
  });

  it('the section Lumen rules never set text under 14 px', () => {
    expect(smallSizes(readAdmin('lumen-help.css'))).toEqual([]);
  });

  it('the admin layout loads the section stylesheet', () => {
    expect(readAdmin('layout.tsx')).toMatch(/import '\.\/lumen-help\.css';/);
  });

  it('report and status messages go through the one toast, refusals stay beside the button', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'admin', 'build', 'BuildActions.tsx'), 'utf8');
    expect(src.match(/showToast\(/g)?.length).toBe(2);
    expect(src).not.toMatch(/setSaid\(\{ text: [^}]*bad: false/);
  });
});
