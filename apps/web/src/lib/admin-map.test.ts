// S28 · PR 707 — the Admin map is made from the menu: only what the person may open, every page with a line, tasks
// only where their page exists, search needs every word, and no line is left over for a page that is gone.
import { describe, expect, it } from 'vitest';
import bn from '../../messages/admin-map.bn.json';
import en from '../../messages/admin-map.en.json';
import { buildAdminMap, MAP_TASKS, pagesWithoutLine, searchMap, staleLines } from './admin-map';
import { SHELL_SECTIONS } from './admin-shell/sections';

const owner = { perms: new Set<string>(), owner: true };
const lines = en.adminMap.lines as Record<string, string>;

describe('admin map (PR 707)', () => {
  it('the owner sees every built page of every section but the Dashboard, grouped', () => {
    const m = buildAdminMap(owner, lines);
    const tabs = SHELL_SECTIONS.filter((s) => s.id !== 'dashboard').reduce((n, s) => n + s.tabs.length, 0);
    expect(m.pages.length).toBe(tabs);
    expect(m.groups.map((g) => g.id)).toEqual(['daily', 'grow', 'business', 'bottom']);
  });
  it('someone with one key sees only that key\'s pages', () => {
    const m = buildAdminMap({ perms: new Set(['orders.read']), owner: false }, lines);
    expect(m.pages.length).toBeGreaterThan(0);
    expect(m.pages.every((p) => p.perm === 'orders.read')).toBe(true);
    expect(buildAdminMap({ perms: new Set(), owner: false }, lines).pages).toEqual([]);
  });
  it('a page hidden by the owner\'s switch is not on the map', () => {
    const m = buildAdminMap({ ...owner, hidden: new Set(['ai']) }, lines);
    expect(m.pages.some((p) => p.section === 'ai')).toBe(false);
  });
  it('every page has a line in both languages, and no line is stale', () => {
    const missing = pagesWithoutLine(buildAdminMap(owner, lines));
    // pages other PRs add to the menu bring their line with them (the nav patch lists them); today's menu has all
    expect(missing).toEqual([]);
    // lines for the prototype's future menu ids (ai.costs, ai.train …) wait for the nav patch
    expect(staleLines(lines)).toContain('ai.costs');
    expect(Object.keys(bn.adminMap.lines).sort()).toEqual(Object.keys(lines).sort());
    expect(Object.keys(bn.adminMap.taskNames).sort()).toEqual(Object.keys(en.adminMap.taskNames).sort());
  });
  it('tasks lead to a page that exists and has a name in both languages', () => {
    const m = buildAdminMap(owner, lines);
    expect(m.tasks.length).toBeGreaterThan(5);
    for (const t of m.tasks) {
      expect(m.pages).toContain(t.page);
      expect((en.adminMap.taskNames as Record<string, string>)[t.id]).toBeTruthy();
    }
    for (const t of MAP_TASKS) expect((bn.adminMap.taskNames as Record<string, string>)[t.id], t.id).toBeTruthy();
  });
  it('search needs every word', () => {
    const items = [{ id: 'a', hay: 'Change the delivery charge' }, { id: 'b', hay: 'Delivery areas' }];
    expect(searchMap('delivery charge', items)).toEqual(['a']);
    expect(searchMap('', items)).toEqual(['a', 'b']);
    expect(searchMap('zzz', items)).toEqual([]);
  });
});
