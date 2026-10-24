import { describe, expect, it } from 'vitest';
import {
  announceSchema,
  desktopNavSchema,
  footerSchema,
  HOME_SECTIONS,
  homeHeroSchema,
  homeHeroSlidesSchema,
  homeSectionsSchema,
  logoStyleSchema,
  menuSchema,
  shopPathSchema,
  sliderEngineSchema,
  storefrontSettings,
  themeColoursSchema,
  themeScheduleSchema,
} from '../src/registry-storefront';
import { registry } from '../src/registry';

const menu = storefrontSettings['shell.menu'].default;

describe('storefront settings (v16)', () => {
  // ~~every key at version 16~~ PR 41 follow-up: home.hero moved to 17 when its Shop now link's default changed;
  // PR 44 added the flash sale (home.flashSale, home.flashRows) at 45
  const LATER: Record<string, number> = { 'home.hero': 17, 'home.flashSale': 45, 'home.flashRows': 45 };
  it('every storefront key is in the registry at version 16, apart from the ones changed since', () => {
    for (const [key, spec] of Object.entries(storefrontSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(LATER[key] ?? 16);
    }
  });

  it('the bottom bar keeps 3 to 5 buttons', () => {
    const two = { ...menu, bottom: menu.bottom.map((b, i) => ({ ...b, on: i < 2 })) };
    expect(menuSchema.safeParse(two).success).toBe(false);
    const three = { ...menu, bottom: menu.bottom.map((b, i) => ({ ...b, on: i < 3 })) };
    expect(menuSchema.safeParse(three).success).toBe(true);
  });

  it('ids inside a list are unique', () => {
    const dup = { ...menu, help: [...menu.help, menu.help[0]] };
    expect(menuSchema.safeParse(dup).success).toBe(false);
  });

  it('a category menu item must name its category, a link item its address and words', () => {
    const cat = { ...menu, items: [...menu.items, { id: 'x', kind: 'cat', on: true, desk: true, phone: true }] };
    expect(menuSchema.safeParse(cat).success).toBe(false);
    const link = { ...menu, items: [...menu.items, { id: 'y', kind: 'link', href: '/help/faq', on: true, desk: true, phone: true }] };
    expect(menuSchema.safeParse(link).success).toBe(false);
  });

  it('links stay inside the shop', () => {
    expect(shopPathSchema.safeParse('/help/faq').success).toBe(true);
    expect(shopPathSchema.safeParse('//evil.example').success).toBe(false);
    expect(shopPathSchema.safeParse('https://evil.example').success).toBe(false);
    expect(shopPathSchema.safeParse('/a b').success).toBe(false);
    expect(shopPathSchema.safeParse('/\\evil').success).toBe(false);
  });

  it('the demo promises that need the owner (COD, free delivery, exchange) wait for him', () => {
    const announce = announceSchema.parse(storefrontSettings['shell.announce'].default);
    expect(announce.messages.every((m) => (m.requires ?? []).length > 0)).toBe(true);
    const footer = footerSchema.parse(storefrontSettings['shell.footer'].default);
    expect(footer.promise.items.find((i) => i.id === 'cod')?.requires).toContain('cod');
    expect(footer.pay.find((p) => p.id === 'cod')?.requires).toContain('cod');
  });

  it('a theme window may not end before it starts', () => {
    expect(themeScheduleSchema.safeParse([{ preset: 'festive', from: '2026-03-20', to: '2026-03-31' }]).success).toBe(true);
    expect(themeScheduleSchema.safeParse([{ preset: 'festive', from: '2026-03-31', to: '2026-03-20' }]).success).toBe(false);
    expect(themeScheduleSchema.safeParse([{ preset: 'pink', from: '2026-03-20', to: '2026-03-31' }]).success).toBe(false);
  });

  it('owner colours are hex only', () => {
    expect(themeColoursSchema.safeParse({ brand: '#1F4E46' }).success).toBe(true);
    expect(themeColoursSchema.safeParse({ brand: 'red' }).success).toBe(false);
    expect(themeColoursSchema.safeParse({ brand: '#1F4E46;}body{display:none' }).success).toBe(false);
  });

  it('the slider snap range is ordered', () => {
    const e = storefrontSettings['slider.engine'].default;
    expect(sliderEngineSchema.safeParse({ ...e, snapMinMs: 500, snapMaxMs: 100 }).success).toBe(false);
  });

  it('owner data has no default', () => {
    for (const key of ['theme.colours', 'brand.logoPhone', 'brand.favicon', 'brand.sloganShort', 'contact.hours', 'language.labels'] as const) {
      expect(storefrontSettings[key].isOwnerData).toBe(true);
      expect(storefrontSettings[key].default).toBeNull();
    }
  });

  it('V12.1 (CN-008/009): every new look is an option, the earlier look stays selectable, the owner\'s defaults', () => {
    const nav = desktopNavSchema.parse(storefrontSettings['shell.desktopNav'].default);
    expect(nav).toMatchObject({ layout: 'catsMore', mainCount: 4, megaStyle: 'drop' });
    for (const layout of ['all', 'catsMore', 'shop', 'priority']) expect(desktopNavSchema.safeParse({ ...nav, layout }).success).toBe(true);
    expect(desktopNavSchema.safeParse({ ...nav, megaStyle: 'panel' }).success).toBe(true);
    expect(desktopNavSchema.safeParse({ ...nav, mainCount: 0 }).success).toBe(false);
    const footer = footerSchema.parse(storefrontSettings['shell.footer'].default);
    expect(footer.deskStyle).toBe('ref');
    expect(footerSchema.safeParse({ ...footer, deskStyle: 'classic' }).success).toBe(true);
    // CN-012 (Note 54): link icons in the reference desktop footer are on by default and can be switched off
    expect(footer.deskIcons).toBe(true);
    expect(footerSchema.safeParse({ ...footer, deskIcons: false }).success).toBe(true);
    expect(storefrontSettings['brand.logoStyle'].default).toBe(0);
    for (let n = 0; n <= 10; n++) expect(logoStyleSchema.safeParse(n).success).toBe(true);
    expect(logoStyleSchema.safeParse(11).success).toBe(false);
  });

  it('H3 / H13: Journal leaves the desktop row and is highlighted in the desktop footer; the phone keeps every link', () => {
    expect(menu.items.find((x) => x.id === 'journal')).toMatchObject({ desk: false, phone: true, on: true });
    const footer = storefrontSettings['shell.footer'].default;
    const links = footer.columns.flatMap((c) => c.links);
    expect(links.find((l) => l.id === 'journal')).toMatchObject({ hl: true, on: true });
    expect(links.filter((l) => l.dev === 'phone').map((l) => l.id).sort()).toEqual(['careers', 'payment', 'tshirts']);
    expect(links.find((l) => l.id === 'combos')).toMatchObject({ dev: 'desk', on: false });
  });

  it('V12.2 (Note 54 #2, Note 58): the footer\'s social marks are the four networks and WhatsApp, each once', () => {
    const footer = storefrontSettings['shell.footer'].default;
    expect(footer.social.map((x) => x.id)).toEqual(['facebook', 'instagram', 'youtube', 'tiktok', 'whatsapp']);
    expect(footer.deskIcons).toBe(true);
    const twice = { ...footer, social: [...footer.social, { id: 'whatsapp', on: false }] };
    expect(footerSchema.safeParse(twice).success).toBe(false);
    expect(footerSchema.safeParse({ ...footer, social: [{ id: 'myspace', on: true }] }).success).toBe(false);
  });

  it('PR 41: the home page sections are the demo\'s ten, each once; the hero keeps one to three buttons', () => {
    const sections = storefrontSettings['home.sections'].default;
    expect(sections.map((x) => x.id)).toEqual([...HOME_SECTIONS]);
    expect(homeSectionsSchema.safeParse([...sections, sections[0]]).success).toBe(false);
    const hero = storefrontSettings['home.hero'].default;
    const four = { ...hero, buttons: [0, 1, 2, 3].map((i) => ({ ...hero.buttons[0]!, id: `b${i}` })) };
    expect(homeHeroSchema.safeParse(four).success).toBe(false);
    expect(homeHeroSchema.safeParse({ ...hero, shift: 241 }).success).toBe(false);
    expect(homeHeroSchema.safeParse({ ...hero, buttons: [{ ...hero.buttons[0]!, href: 'https://evil.example' }] }).success).toBe(false);
  });

  it('PR 41: the hero\'s promise lines wait for the owner (COD, exchange)', () => {
    const hero = storefrontSettings['home.hero'].default;
    expect(hero.trust.find((x) => x.id === 'cod')?.requires).toEqual(['cod']);
    expect(hero.trust.find((x) => x.id === 'exchange')?.requires).toEqual(['exchange']);
    expect(hero.setsLook).toBe('v3');
  });

  it('PR 43: the hero pictures default to the demo (14, two per category, 20 px/s, 380 ms, 140 px fade), phone arrows off', () => {
    const sl = storefrontSettings['home.heroSlides'].default;
    expect(sl).toMatchObject({ count: 14, perCategory: 2, collection: null, speed: 20, stepMs: 380, fade: 140, wash: false, phoneArrows: false });
    expect(homeHeroSlidesSchema.safeParse({ ...sl, fade: 100 }).success).toBe(false);
    expect(homeHeroSlidesSchema.safeParse({ ...sl, count: 0 }).success).toBe(false);
    expect(homeHeroSlidesSchema.safeParse({ ...sl, collection: 'Winter Sale' }).success).toBe(false);
    expect(homeHeroSlidesSchema.safeParse({ ...sl, collection: 'winter-2026', fade: 80 }).success).toBe(true);
  });
});
