// S28 · PR 686 (the wave 4B nav patch): the five pages of wave 4B are tabs of their sections, so the menu, the tabs and the
// global search all find them, in English and in Bengali, each only for a person who may open it.
import { describe, expect, it } from 'vitest';
import { adminSearch } from './search';
import { locateKey, sectionById, visibleTabs, type ShellViewer } from './sections';

const OWNER: ShellViewer = { perms: new Set(), owner: true, hidden: new Set() };
const limits = { perGroup: 8, minChars: 2 };
const hrefs = async (lang: 'en' | 'bn', q: string, viewer = OWNER) => (await adminSearch({ db: null, storeId: 1, lang, viewer, limits }, q)).flatMap((g) => g.items.map((i) => i.href));

describe('PR 686 · the wave 4B pages are in the menu and the search', () => {
  it('each page key sits in its section tab', () => {
    expect(locateKey('productRanking')?.section.id).toBe('products');
    expect(locateKey('moneyCash')?.section.id).toBe('money');
    expect(locateKey('moneyBudgets')?.section.id).toBe('money');
    expect(locateKey('reportsLibrary')?.section.id).toBe('reports');
    expect(locateKey('reportsPacks')?.section.id).toBe('reports');
  });

  it('the Report library is the first Reports tab', () => {
    expect(visibleTabs(sectionById('reports')!, OWNER)[0]!.id).toBe('library');
  });

  it('the palette finds them by their own names in both languages', async () => {
    expect(await hrefs('en', 'shop ranking')).toContain('/admin/products/ranking');
    expect(await hrefs('en', 'money in')).toContain('/admin/money/cash');
    expect(await hrefs('en', 'budgets')).toContain('/admin/money/budgets');
    expect(await hrefs('en', 'report library')).toContain('/admin/reports');
    expect(await hrefs('en', 'report packs')).toContain('/admin/reports/packs');
    expect(await hrefs('bn', 'রিপোর্ট প্যাক')).toContain('/admin/reports/packs');
    expect(await hrefs('bn', 'বাজেট')).toContain('/admin/money/budgets');
  });

  it('a person without the permission does not see the page', async () => {
    const nobody: ShellViewer = { perms: new Set(['catalogue.read']), owner: false, hidden: new Set() };
    expect(await hrefs('en', 'report packs', nobody)).not.toContain('/admin/reports/packs');
    expect(await hrefs('en', 'shop ranking', nobody)).toContain('/admin/products/ranking');
  });
});
