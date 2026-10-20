// PR 40 (H3, H4, H13 of CN-008) — the desktop row's arrangements and the reference desktop footer, as data.
import { describe, expect, it } from 'vitest';
import { storefrontSettings, type DesktopNav } from '@extas/settings';
import { shopT } from './dict';
import { SIGNUP_LIST_LIVE, deskNavItems, footerColumns, footerDeskColumns, joinShown, phoneMenuRows, type Flags, type ShopCategory } from './shell-model';

const menu = storefrontSettings['shell.menu'].default;
const nav = storefrontSettings['shell.desktopNav'].default as DesktopNav;
const footer = storefrontSettings['shell.footer'].default;
const t = shopT('en');

const cat = (slug: string, count = 3, kids = 0): ShopCategory => ({
  slug,
  nameEn: slug[0]!.toUpperCase() + slug.slice(1),
  nameBn: null,
  garment: null,
  count,
  children: Array.from({ length: kids }, (_, i) => ({ slug: `${slug}-${i}`, nameEn: `${slug} ${i}`, nameBn: null, count: 1 })),
});
const cats = ['polos', 'tshirts', 'shirts', 'panjabi', 'trousers', 'hoodies'].map((s, i) => cat(s, 3, i === 0 ? 2 : 0));

describe('the desktop row (H3, H4)', () => {
  it("the owner's default: New in, the first four categories, the rest kept under More; no Journal", () => {
    const row = deskNavItems(menu, nav, cats, t, '/');
    expect(row.map((x) => x.id)).toEqual(['new', 'cat-polos', 'cat-tshirts', 'cat-shirts', 'cat-panjabi', 'cat-trousers', 'cat-hoodies', 'more', 'combos', 'sets']);
    expect(row.filter((x) => x.fixFold).map((x) => x.catSlug)).toEqual(['trousers', 'hoodies']);
    expect(row.find((x) => x.id === 'more')?.mega).toBe(true);
    expect(row.some((x) => x.kind === 'journal')).toBe(false);
  });

  it('More is "here" when the page is a category kept under it', () => {
    const row = deskNavItems(menu, nav, cats, t, '/collections/hoodies');
    expect(row.find((x) => x.id === 'more')?.current).toBe(true);
  });

  it("'all' and 'priority' keep every category in the row (folding only when it does not fit)", () => {
    for (const layout of ['all', 'priority'] as const) {
      const row = deskNavItems(menu, { ...nav, layout }, cats, t, '/');
      expect(row.some((x) => x.fixFold)).toBe(false);
      expect(row.filter((x) => x.catSlug)).toHaveLength(6);
    }
  });

  it('mainCount moves the line', () => {
    const row = deskNavItems(menu, { ...nav, mainCount: 2 }, cats, t, '/');
    expect(row.filter((x) => x.catSlug && !x.fixFold).map((x) => x.catSlug)).toEqual(['polos', 'tshirts']);
  });

  it("'shop': one Shop item with every category, then New in (no list of its own) and the rest; no More", () => {
    const row = deskNavItems(menu, { ...nav, layout: 'shop' }, cats, t, '/collections/shirts');
    expect(row.map((x) => x.id)).toEqual(['shop', 'new', 'combos', 'sets']);
    expect(row[0]).toMatchObject({ label: 'Shop', mega: true, current: true, shopCats: cats.map((c) => c.slug) });
    expect(row[1]?.mega).toBe(false);
  });

  it('a category opens a list only when it has sub-categories, and only with menus switched on', () => {
    const row = deskNavItems(menu, nav, cats, t, '/');
    expect(row.filter((x) => x.mega && x.catSlug).map((x) => x.catSlug)).toEqual(['polos']);
    expect(deskNavItems(menu, { ...nav, mega: false }, cats, t, '/').some((x) => x.mega)).toBe(false);
  });

  it('the phone menu keeps Journal (H3 is desktop only)', () => {
    expect(phoneMenuRows(menu, cats, t).some((r) => r.id === 'journal')).toBe(true);
  });
});

describe('the reference desktop footer (H13)', () => {
  const opts = { combos: true };
  it('shows the short desktop words, leaves the phone-only links out and puts Journal second, highlighted', () => {
    const cols = footerDeskColumns(footer, cats, t, { store: 'Sample' }, opts);
    const by = Object.fromEntries(cols.map((c) => [c.id, c.links.map((l) => l.label)]));
    expect(by.shop).toEqual(['New in', 'Polos', 'Shirts', 'Panjabi', 'Sets']);
    expect(by.help).toEqual(['Track order', 'Size guide', 'Delivery', 'Exchange', 'FAQ']);
    expect(by.about).toEqual(['Our story', 'Journal', 'Contact', 'Privacy', 'Terms']);
    expect(cols.find((c) => c.id === 'about')?.links.find((l) => l.id === 'journal')?.hl).toBe(true);
    expect(cols.find((c) => c.id === 'about')?.title).toBe('Sample');
  });

  it('the phone footer keeps every link it had', () => {
    const cols = footerColumns(footer, cats, t, false, {}, opts);
    expect(cols.find((c) => c.id === 'shop')?.links.map((l) => l.id)).toEqual(['new', 'polos', 'tshirts', 'shirts', 'panjabi', 'sets']);
    expect(cols.find((c) => c.id === 'help')?.links).toHaveLength(6);
    expect(cols.find((c) => c.id === 'about')?.links).toHaveLength(6);
  });
});

describe('CN-017 · every promise in customer copy is kept, or it is not shown', () => {
  const flags = (signupList: boolean): Flags => ({ cod: true, freeDelivery: true, exchange: true, whatsapp: true, hotline: true, signupList });
  it('"Get new drops first" waits for the sign-up list that keeps the number (PR 123 / 298); the switch still turns it off', () => {
    expect(SIGNUP_LIST_LIVE).toBe(false);
    expect(footer.join).toEqual({ on: true, requires: ['signupList'] });
    expect(joinShown(footer, flags(false))).toBe(false);
    expect(joinShown(footer, flags(true))).toBe(true);
    expect(joinShown({ ...footer, join: { on: false, requires: ['signupList'] } }, flags(true))).toBe(false);
  });
});
