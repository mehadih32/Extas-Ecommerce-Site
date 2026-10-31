// S18 · PR 387 — the Site manual's book: a chapter per visible section in the sidebar's order, every built page's guide
// in exactly one chapter, "Open this page" only where the person may go, and nothing outside the guide folder read.
import { describe, expect, it } from 'vitest';
import { guideDir } from './guide';
import { HELP_PAGES } from './help-pages';
import { manualAnchor, manualOutline, manualSections, openHref, readChapter } from './manual';
import { SHELL_SECTIONS, type ShellViewer } from './sections';

const owner: ShellViewer = { perms: new Set(), owner: true };
const helper: ShellViewer = { perms: new Set(['help.read']), owner: false };
const packer: ShellViewer = { perms: new Set(['help.read', 'orders.read']), owner: false };

describe('Site manual (PR 387)', () => {
  const dir = guideDir();

  it('finds the guides in the repository', () => {
    expect(dir).not.toBeNull();
  });

  it('gives the owner every section as a chapter, in the sidebar order, with every built page in exactly one', async () => {
    const outline = await manualOutline(owner, dir);
    expect(outline.map((c) => c.section)).toEqual(SHELL_SECTIONS.map((s) => s.id));
    const ids = outline.flatMap((c) => c.pages.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(HELP_PAGES.map((p) => p.id).sort());
    for (const c of outline) {
      expect(c.overviewTitle, c.section).toBeTruthy();
      for (const p of c.pages) expect(p.id.startsWith(`${c.section}/`)).toBe(true);
    }
    expect(outline.find((c) => c.section === 'help')!.pages.map((p) => p.id)).toContain('help/site-manual');
  });

  it('shows a team member only the sections they hold a key in', async () => {
    expect(manualSections(helper)).toContain('help');
    expect(manualSections(helper)).not.toContain('orders');
    expect(manualSections(packer)).toContain('orders');
    expect(manualSections(packer)).not.toContain('money');
    expect(await readChapter('money', packer, dir)).toBeNull();
    expect(await readChapter('nothing', owner, dir)).toBeNull();
  });

  it('offers "Open this page" only for a fixed address the person may open', () => {
    expect(openHref('/admin/orders/[id]', owner)).toBeNull();
    expect(openHref('/admin', helper)).toBe('/admin?home=1');
    expect(openHref('/admin/orders/confirm', owner)).toBe('/admin/orders/confirm');
    expect(openHref('/admin/orders/confirm', helper)).toBeNull();
    expect(openHref('/admin/help/manual', helper)).toBe('/admin/help/manual');
  });

  it('reads a whole chapter: the overview and each page guide in its six parts', async () => {
    const ch = (await readChapter('orders', owner, dir))!;
    expect(ch.overview?.blocks.length).toBeGreaterThan(0);
    expect(ch.pages.length).toBeGreaterThan(3);
    const first = ch.guides[ch.pages[0]!.id]!;
    const heads = first.blocks.filter((b) => b.t === 'h').length;
    expect(heads).toBeGreaterThanOrEqual(6);
    expect(ch.pages.find((p) => p.id === 'orders/order')!.href).toBeNull();
  });

  it('names each page guide an anchor of its own', () => {
    expect(manualAnchor('orders/confirm')).toBe('p-orders-confirm');
  });

  it('reads nothing when the guides are not on the server', async () => {
    expect(await manualOutline(owner, null)).toEqual([]);
    expect(await readChapter('orders', owner, null)).toBeNull();
  });
});
