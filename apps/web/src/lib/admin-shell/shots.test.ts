// S18 · PR 388 — the manual's pictures: marks.json read as data (bad entries dropped, off-screen marks dropped and the
// rest numbered), only a listed picture served, and the marks config every page guide can use.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guideDir } from './guide';
import { HELP_PAGES } from './help-pages';
import { parseShots, readShots, shotFile, smokeDir } from './shots';
import { shotHandler } from './shot-api';

const mark = (label: string, x = 0.1, y = 0.2, shown = true) => ({ n: 1, label, shown, x, y, w: 0.3, h: 0.05 });

describe('Site manual pictures (PR 388)', () => {
  it('keeps only well-formed pictures and on-screen marks, numbered from 1, desktop first', () => {
    const book = parseShots({
      at: '2026-10-31 22:00',
      shots: [
        { guide: 'help/manual', path: '/admin/help', screen: 'phone', screenshot: 'admin-help-phone.jpg', marks: [mark('A'), mark('B', 0.1, 1.4)] },
        { guide: 'help/manual', path: '/admin/help', screen: 'desktop', screenshot: 'admin-help-desktop.jpg', marks: [mark('A', 0.1, 0.2, false), mark('B'), mark('C', 0.95, 0.9)] },
        { guide: 'help/manual', screen: 'desktop', screenshot: 'admin-help-desktop.jpg', marks: [mark('dup')] },
        { guide: '../etc/passwd', screen: 'desktop', screenshot: 'a-desktop.jpg', marks: [] },
        { guide: 'help/x', screen: 'tablet', screenshot: 'a-tablet.jpg', marks: [] },
        { guide: 'help/y', screen: 'desktop', screenshot: '../../secret-desktop.jpg', marks: [] },
        { guide: 'help/z', screen: 'desktop', screenshot: 'z-desktop.jpg', marks: [{ shown: true, label: 'x'.repeat(200), x: 0, y: 0, w: 1, h: 1 }, { shown: true, label: 'NaN', x: 'a', y: 0, w: 1, h: 1 }] },
      ],
    });
    expect(book.at).toBe('2026-10-31 22:00');
    expect(Object.keys(book.byGuide).sort()).toEqual(['help/manual', 'help/z']);
    const [desk, phone] = book.byGuide['help/manual']!;
    expect(desk!.screen).toBe('desktop');
    expect(desk!.marks.map((m) => [m.n, m.label])).toEqual([
      [1, 'B'],
      [2, 'C'],
    ]);
    expect(desk!.marks[1]!.w).toBeCloseTo(0.05);
    expect(phone!.marks.map((m) => m.label)).toEqual(['A']);
    expect(book.byGuide['help/z']![0]!.marks).toEqual([]);
    expect(parseShots(null)).toEqual({ at: null, byGuide: {} });
    expect(parseShots({ shots: 'no' })).toEqual({ at: null, byGuide: {} });
  });

  it('serves only a picture named in marks.json, from the smoke folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'extas-shots-'));
    await writeFile(join(dir, 'marks.json'), JSON.stringify({ shots: [{ guide: 'help/manual', screen: 'desktop', screenshot: 'admin-help-desktop.jpg', marks: [] }] }));
    await writeFile(join(dir, 'admin-help-desktop.jpg'), 'jpeg');
    await writeFile(join(dir, 'admin-orders-desktop.jpg'), 'other');
    expect(String(await shotFile('admin-help-desktop.jpg', dir))).toBe('jpeg');
    expect(await shotFile('admin-orders-desktop.jpg', dir)).toBeNull();
    expect(await shotFile('../marks.json', dir)).toBeNull();
    expect(await shotFile('admin-help-desktop.jpg', null)).toBeNull();
    expect(await readShots(join(dir, 'missing'))).toEqual({ at: null, byGuide: {} });
    await writeFile(join(dir, 'marks.json'), '{broken');
    expect(await readShots(dir)).toEqual({ at: null, byGuide: {} });
  });

  it('refuses the picture without a session', async () => {
    const res = await shotHandler(new Request('http://localhost/api/admin/help/shot/admin-help-desktop.jpg'), 'admin-help-desktop.jpg', null, async () => Buffer.from('x'));
    expect(res.status).toBe(503);
  });

  it('marks.json names real page guides and their own built addresses', () => {
    const dir = guideDir()!;
    expect(smokeDir(dir)).toMatch(/reports[/\\]smoke[/\\]latest$/);
    const config = JSON.parse(readFileSync(join(dir, 'marks.json'), 'utf8')) as { shots: { guide: string; path: string; marks: { sel: string; label: string }[] }[] };
    const routes = new Map(HELP_PAGES.map((p) => [p.id, p.route]));
    expect(config.shots.length).toBeGreaterThan(0);
    for (const s of config.shots) {
      expect(routes.has(s.guide), s.guide).toBe(true);
      expect(s.path.split('?')[0]).toBe(routes.get(s.guide));
      expect(s.marks.length).toBeGreaterThan(0);
      for (const m of s.marks) {
        expect(m.sel.trim()).not.toBe('');
        expect(m.label.length).toBeLessThanOrEqual(80);
      }
    }
  });
});
