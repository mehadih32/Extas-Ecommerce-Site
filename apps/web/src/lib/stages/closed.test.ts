// S19 · PR 652: no hidden part of a closed stage is in a menu, the admin search, the sitemap or robots' open list.
import { describe, expect, it } from 'vitest';
import { CLOSED_STAGES, CLOSED_STAGES_SHOWN_DEFAULT } from '@extas/settings';
import { closedPaths, robotsTxt } from '../seo/robots';
import { adminSearch } from '../admin-shell/search';
import { SHELL_SECTIONS, sectionById, sectionVisible, visibleTabs, type ShellViewer } from '../admin-shell/sections';
import { CLOSED_STAGE_PARTS, closedStageOfPart, hiddenAdminParts, hiddenShopPaths, hiddenStages, isHiddenPath } from './closed';

const OWNER = (hidden: Set<string>): ShellViewer => ({ perms: new Set(), owner: true, hidden });
const ALL_SHOWN = Object.fromEntries(CLOSED_STAGES.map((s) => [s, true]));

describe('closed stages hidden by a switch (PR 652)', () => {
  it('hides every closed stage as shipped, and an unreadable value hides them all', () => {
    expect(hiddenStages(CLOSED_STAGES_SHOWN_DEFAULT)).toEqual([...CLOSED_STAGES]);
    expect(hiddenStages(null)).toEqual([...CLOSED_STAGES]);
    expect(hiddenStages({ ...CLOSED_STAGES_SHOWN_DEFAULT, S15: true })).not.toContain('S15');
  });

  it('every part it names is a real admin section or tab', () => {
    for (const s of CLOSED_STAGES) {
      for (const id of CLOSED_STAGE_PARTS[s].sections) expect(sectionById(id), id).not.toBeNull();
      for (const id of CLOSED_STAGE_PARTS[s].tabs) {
        const [sec, tab] = id.split('.');
        expect(sectionById(sec!)?.tabs.some((t) => t.id === tab), id).toBe(true);
      }
      for (const p of CLOSED_STAGE_PARTS[s].shop) expect(p.startsWith('/'), p).toBe(true);
    }
  });

  it('with S15 closed the AI Center is in no menu, not even the owner\'s, and back when its switch is on', () => {
    const hidden = hiddenAdminParts(CLOSED_STAGES_SHOWN_DEFAULT);
    expect(hidden.has('ai')).toBe(true);
    expect(hidden.has('assistant')).toBe(true);
    const ai = sectionById('ai')!;
    expect(sectionVisible(ai, OWNER(hidden))).toBe(false);
    expect(sectionVisible(ai, OWNER(hiddenAdminParts(ALL_SHOWN)))).toBe(true);
    // every other section is untouched
    const open = SHELL_SECTIONS.filter((s) => s.id !== 'ai');
    expect(open.every((s) => sectionVisible(s, OWNER(hidden)))).toBe(true);
  });

  it('no hidden section or tab is in the menu or the admin search', async () => {
    const hidden = hiddenAdminParts(CLOSED_STAGES_SHOWN_DEFAULT);
    const v = OWNER(hidden);
    for (const s of SHELL_SECTIONS.filter((x) => sectionVisible(x, v))) {
      expect(hidden.has(s.id), s.id).toBe(false);
      for (const t of visibleTabs(s, v)) expect(hidden.has(`${s.id}.${t.id}`), `${s.id}.${t.id}`).toBe(false);
    }
    const search = async (viewer: ShellViewer, q: string) =>
      (await adminSearch({ db: null as never, storeId: 1, lang: 'en', viewer, limits: { perGroup: 50, minChars: 2 } }, q)).flatMap((g) => g.items.map((i) => i.href));
    const aiHrefs = sectionById('ai')!.tabs.flatMap((t) => t.pages.map((p) => p.href));
    for (const q of ['', 'audit', 'checklist', '?ai', '?checklist']) {
      const hrefs = await search(v, q);
      for (const href of aiHrefs) expect(hrefs, `${q} ${href}`).not.toContain(href);
      expect(hrefs, q).not.toContain('/admin/ai');
    }
    // the switch on brings it back into the search
    const auditHref = aiHrefs.find((h) => h.endsWith('/audit'))!;
    expect(await search(OWNER(hiddenAdminParts(ALL_SHOWN)), 'audit')).toContain(auditHref);
  });

  it('keeps a hidden shop address out of the sitemap and robots\' open list, in both languages', () => {
    const paths = ['/studio'];
    expect(isHiddenPath('/studio', paths)).toBe(true);
    expect(isHiddenPath('/studio/look-1?x=1', paths)).toBe(true);
    expect(isHiddenPath('/bn/studio', paths)).toBe(true);
    expect(isHiddenPath('/studios', paths)).toBe(false);
    expect(isHiddenPath('/', paths)).toBe(false);
    const txt = robotsTxt({ disallow: [], aiCrawlers: true, aiBots: [] } as never, { open: true, searchListed: false, sitemap: null, hidden: paths });
    expect(txt).toContain('Disallow: /studio\n');
    expect(txt).toContain('Disallow: /bn/studio\n');
    // as shipped no closed stage has a shop page yet: robots lists only its own closed paths
    expect(hiddenShopPaths(CLOSED_STAGES_SHOWN_DEFAULT)).toEqual([]);
    const plain = robotsTxt({ disallow: [], aiCrawlers: true, aiBots: [] } as never, { open: true, searchListed: false, sitemap: null, hidden: hiddenShopPaths(CLOSED_STAGES_SHOWN_DEFAULT) });
    expect(plain.split('\n').filter((l) => l.startsWith('Disallow:')).length).toBe(closedPaths(false).length);
  });

  it('names the closed stage of a hidden part, for its "closed by the owner" state (669)', () => {
    expect(closedStageOfPart('ai')).toBe('S15');
    expect(closedStageOfPart('assistant')).toBe('S15');
    expect(closedStageOfPart('orders')).toBeNull();
    for (const s of CLOSED_STAGES) for (const id of [...CLOSED_STAGE_PARTS[s].sections, ...CLOSED_STAGE_PARTS[s].tabs]) expect(closedStageOfPart(id)).toBe(s);
  });
});
