import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOK_DIR, REGISTRY, main, planDesign } from './new-design.mjs';

const real = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', REGISTRY), 'utf8');

describe('pnpm admin:design (PR 12, CN-025)', () => {
  it('adds one module and one registry line for a new Dashboard design', () => {
    const plan = planDesign({ registry: real, page: 'dashboard', key: 'D', en: 'Focus', bn: 'ফোকাস' });
    expect(plan.file.path).toBe(`${LOOK_DIR}/dashboard/D.tsx`);
    const added = plan.registry.split('\n').filter((l) => !real.split('\n').includes(l));
    expect(added).toEqual(["import { dashboardD } from './dashboard/D';", '      dashboardD,']);
    // The line sits in the Dashboard's list, right before its marker.
    const lines = plan.registry.split('\n');
    expect(lines[lines.indexOf('      // admin:design dashboard') - 1]).toBe('      dashboardD,');
    expect(plan.file.text).toContain("key: 'D'");
    expect(plan.file.text).toContain('name: { en: "Focus", bn: "ফোকাস" }');
    expect(plan.file.text).toContain('export const dashboardD: LookDesign<DashProps, DashPart>');
    // The start keeps the page's contract: the one KPI pair, the shared header.
    expect(plan.file.text).toContain('testId="dash-kpi-sales"');
    expect(plan.file.text).toContain('testId="dash-kpi-ordered"');
    expect(plan.file.text).toContain('<DashHead p={p} />');
  });

  it('refuses a key the page has, a bad key, an unknown page, a page not drawn through the registry, an existing file', () => {
    expect(() => planDesign({ registry: real, page: 'dashboard', key: 'A' })).toThrow(/already has a design A/);
    expect(() => planDesign({ registry: real, page: 'dashboard', key: 'b' })).toThrow(/not a design key/);
    expect(() => planDesign({ registry: real, page: 'Dash', key: 'D' })).toThrow(/not a page id/);
    expect(() => planDesign({ registry: real, page: 'nowhere', key: 'D' })).toThrow(/no page "nowhere"/);
    expect(() => planDesign({ registry: real, page: 'orders', key: 'B' })).toThrow(/does not draw its designs through the registry yet/);
    expect(() => planDesign({ registry: real, page: 'dashboard', key: 'D', has: () => true })).toThrow(/exists already/);
  });

  it('writes both files, and a second run for the same key is refused', () => {
    const root = mkdtempSync(join(tmpdir(), 'admin-design-'));
    try {
      mkdirSync(join(root, LOOK_DIR), { recursive: true });
      writeFileSync(join(root, REGISTRY), real);
      const log = [];
      main(['dashboard', 'E', '--en', 'Wide', '--bn', 'চওড়া'], root, (m) => log.push(m));
      expect(existsSync(join(root, LOOK_DIR, 'dashboard', 'E.tsx'))).toBe(true);
      expect(readFileSync(join(root, REGISTRY), 'utf8')).toContain("import { dashboardE } from './dashboard/E';");
      expect(log[0]).toMatch(/Preview it at \?design=E/);
      expect(() => main(['dashboard', 'E'], root, () => {})).toThrow(/already has a design E/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
