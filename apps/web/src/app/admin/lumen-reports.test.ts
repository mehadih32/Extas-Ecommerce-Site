// PR 645, 644 (CN-036) — the Reports section in the Lumen look: every page root is marked ready (so it follows dark
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

const PART1 = ['team', 'delivery', 'customers', 'stopped', 'fraud', 'areas', 'flags', 'learning', 'experiments', 'experiments/[id]'].map((p) => `reports/${p}/page.tsx`);

describe('Reports part 1: the reports and Experiments in the Lumen look (PR 644)', () => {
  it.each(PART1)('%s: every page root and the no-access wrapper are ready, the main one carries the section class', (p) => {
    const src = readAdmin(p);
    expect(unreadyRoots(src)).toEqual([]);
    expect(unmarkedDenied(src)).toEqual([]);
    expect(src).toMatch(/className="a2-z lm-rp" data-lm-ready="" data-testid="/);
  });

  it('the report styles it lifts to 14 px are in tokens, and the old files keep no colour literal', () => {
    const css = readAdmin('lumen-reports.css');
    for (const k of ['.fr-tbl th[scope=row]', '.lrn-people td', '.stp-list td', '.xpb-changes', '.cr-sub', '.fr-inc']) expect(css).toContain(k);
    for (const f of ['reports/fraud/fraud.css', 'reports/learning/learning.css', 'reports/stopped/stopped.css', 'reports/flags/flags.css', 'reports/experiments/experiments.css', 'reports/delivery/report.css']) expect(styleLiterals(readAdmin(f)), f).toEqual([]);
  });

  it('saving the team badges and an experiment speaks through the one toast; a problem stays inline', () => {
    for (const f of ['reports/TeamBadgesCard.tsx', 'reports/ExperimentEditor.tsx']) {
      const src = comp(f);
      expect(src, f).toContain('showToast(');
      expect(src, f).not.toMatch(/bad: false/);
      expect(src, f).toMatch(/bad: true/);
      expect(src, f).not.toContain('undo:');
    }
  });
});

describe('Reports part 1: the figures rows are the shared summary tiles (PR 644 follow-up)', () => {
  it('the Stopped report\'s link to the risk rules is a 44 px tap', () => {
    expect(readAdmin('lumen-reports.css')).toMatch(/\.stp-link \{[^}]*min-height: var\(--lm-tap\)/);
  });

  const ROWS: [string, string][] = [
    ['delivery', 'delivery-kpis'],
    ['customers', 'customers-kpis'],
    ['stopped', 'stopped-kpis'],
    ['fraud', 'fraud-kpis'],
    ['flags', 'flags-kpis'],
    ['learning', 'learning-kpis'],
    ['areas', 'ar-kpi'],
  ];
  it.each(ROWS)('reports/%s: <SummaryTiles> with figureTiles, no old a2-kpi tile', (page, testId) => {
    const src = readAdmin(`reports/${page}/page.tsx`);
    expect(src).toContain('<SummaryTiles ');
    expect(src).toContain('figureTiles(');
    expect(src).toContain(`testId="${testId}"`);
    expect(src).not.toMatch(/a2-kpi\b/);
  });
});
