// PR 12 follow-up 209: the empty palette lists the person's recent pages first, only those they may still open.
import { describe, expect, it } from 'vitest';
import { adminSearch, recentItems } from './search';
import type { ShellViewer } from './sections';

const OWNER: ShellViewer = { perms: new Set(), owner: true, hidden: new Set() };
const CATALOGUE: ShellViewer = { perms: new Set(['catalogue.read']), owner: false, hidden: new Set() };
const limits = { perGroup: 2, minChars: 2 };

describe('PR 12 follow-up 209 · the palette recent pages', () => {
  it('lists the recent pages first on an empty box, newest first, by their own names', async () => {
    const groups = await adminSearch({ db: null, storeId: 1, lang: 'en', viewer: OWNER, limits, recent: ['/admin/stock', '/admin/orders', '/admin'] }, '');
    expect(groups[0]!.id).toBe('recent');
    expect(groups[0]!.label).toBe('Recent');
    // not cut to the per-group limit (the setting already chose how many)
    expect(groups[0]!.items.map((i) => i.href)).toEqual(['/admin/stock', '/admin/orders', '/admin?home=1']);
    expect(groups[0]!.items.every((i) => i.icon === 'clock' && i.label)).toBe(true);
    expect(groups[1]!.id).toBe('jump');
  });

  it('drops a page the person may no longer open, or that is no page; none while typing or without any', async () => {
    expect(recentItems(['/admin/orders', '/admin/products', '/admin/nowhere'], CATALOGUE, 'en').map((i) => i.href)).toEqual(['/admin/products']);
    expect((await adminSearch({ db: null, storeId: 1, lang: 'en', viewer: OWNER, limits, recent: ['/admin/orders'] }, 'ord')).map((g) => g.id)).not.toContain('recent');
    expect((await adminSearch({ db: null, storeId: 1, lang: 'en', viewer: OWNER, limits }, '')).map((g) => g.id)[0]).toBe('jump');
    expect((await adminSearch({ db: null, storeId: 1, lang: 'bn', viewer: OWNER, limits, recent: ['/admin/orders'] }, ''))[0]!.label).toBe('সম্প্রতি খোলা');
  });
});
