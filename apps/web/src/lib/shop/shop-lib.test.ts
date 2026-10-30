// PR 82, 501, 503, 84 — tokens and contrast, the theme of the day, the dictionary and the two languages' addresses.
import { describe, expect, it } from 'vitest';
import { SHOP_ICONS } from '@extas/settings';
import { SHOP_DICTS, keysOf, shopT } from './dict';
import { formatMoney, formatNumber, hrefIn, isShopPath, splitLang, toBnDigits, twinHref } from './lang';
import { presetFor, shopTheme, todayIn } from './theme';
import { THEMES, THEME_PRESETS, chooseTheme, contrastIssues, cssVariables, toDesignTokens, tokensOf } from './tokens';
import { ICON_PATHS } from '../../components/shop/icon-paths';

describe('PR 82 · themes and tokens', () => {
  it('every theme keeps its text pairs at 4.5:1 or better', () => {
    for (const p of THEME_PRESETS) expect(contrastIssues(THEMES[p]), p).toEqual([]);
  });

  it('every theme sets the same tokens', () => {
    const keys = Object.keys(THEMES.classic).sort();
    for (const p of THEME_PRESETS) expect(Object.keys(THEMES[p]).sort()).toEqual(keys);
  });

  it('the owner colour that breaks contrast is refused and the designed theme stays', () => {
    const c = chooseTheme('classic', { ink: '#CCCCCC' }, null);
    expect(c.colours).toEqual({});
    expect(c.refused).toContain('ink');
    const ok = chooseTheme('classic', { brand: '#123456', nonsense: '#000000', sale: 'red' }, null);
    expect(ok.colours).toEqual({ brand: '#123456' });
    expect(ok.refused.sort()).toEqual(['nonsense', 'sale']);
  });

  it('fonts are only the self-hosted ones', () => {
    const c = chooseTheme('classic', null, { body: 'archivo', display: 'Comic Sans' });
    expect(tokensOf(c)['font-body']).toContain('Archivo');
    expect(c.fonts.display).toBeUndefined();
  });

  it('emits CSS variables and a design-tokens document', () => {
    expect(cssVariables(THEMES.noir)).toMatch(/^--bg:#FFFFFF;/);
    expect(cssVariables(THEMES.noir)).not.toMatch(/[<>{}]/);
    const doc = toDesignTokens() as Record<string, { color: Record<string, { $value: string }> }>;
    expect(doc.festive!.color.brand!.$value).toBe('#C9A14A');
  });
});

describe('PR 82 · the theme of the day', () => {
  const schedule = [{ preset: 'festive' as const, from: '2027-03-08', to: '2027-03-12' }];
  it('a dated window wins inside its days only', () => {
    expect(presetFor('2027-03-07', 'classic', schedule)).toBe('classic');
    expect(presetFor('2027-03-08', 'classic', schedule)).toBe('festive');
    expect(presetFor('2027-03-12', 'classic', schedule)).toBe('festive');
    expect(presetFor('2027-03-13', 'classic', schedule)).toBe('classic');
  });

  it('today is the store’s day, not the server’s', () => {
    expect(todayIn('Asia/Dhaka', new Date('2026-10-20T19:30:00Z'))).toBe('2026-10-21');
  });

  it('a preview link shows a theme only when previews are allowed, without the owner colours', () => {
    const base = { preset: 'classic' as const, schedule: [], colours: { brand: '#123456' }, fonts: null, today: '2026-10-20' };
    expect(shopTheme({ ...base, preview: 'noir', previewAllowed: true }).choice.preset).toBe('noir');
    expect(shopTheme({ ...base, preview: 'noir', previewAllowed: true }).choice.colours).toEqual({});
    expect(shopTheme({ ...base, preview: 'noir', previewAllowed: false }).choice.preset).toBe('classic');
    expect(shopTheme({ ...base, preview: 'pink', previewAllowed: true }).choice.preset).toBe('classic');
    expect(shopTheme({ ...base, previewAllowed: true }).tokens.brand).toBe('#123456');
  });
});

describe('PR 503 · the dictionary', () => {
  it('English and Bengali have the same keys', () => {
    expect(keysOf(SHOP_DICTS.bn).sort()).toEqual(keysOf(SHOP_DICTS.en).sort());
  });

  it('no Bengali entry is left empty', () => {
    for (const k of keysOf(SHOP_DICTS.bn)) expect(shopT('bn')(k).trim().length, k).toBeGreaterThan(0);
  });

  it('every default label key of the storefront settings is in the dictionary', async () => {
    const { registry } = await import('@extas/settings');
    const json = JSON.stringify([
      registry['shell.menu'].default,
      registry['shell.footer'].default,
      registry['shell.announce'].default,
    ]);
    const keys = [...json.matchAll(/"key":"([^"]+)"/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) expect(shopT('en').has(k), k).toBe(true);
  });

  it('fills slots, and the owner’s own words win', () => {
    const t = shopT('bn', { 'help.faq': { bn: 'সব প্রশ্ন' } });
    expect(t('help.faq')).toBe('সব প্রশ্ন');
    expect(t('menu.hotline', { number: '123' })).toBe('হটলাইন 123');
    expect(t('no.such.key')).toBe('no.such.key');
    expect(t.label({ en: 'Hi', bn: 'হাই' })).toBe('হাই');
    expect(t.label({ key: 'nav.journal' })).toBe('জার্নাল');
  });

  it('the icon set the settings allow is the icon set the shop draws', () => {
    expect(Object.keys(ICON_PATHS).sort()).toEqual([...SHOP_ICONS].sort());
  });
});

describe('PR 84 · English at the root, Bengali under /bn', () => {
  it('splits and joins addresses', () => {
    expect(splitLang('/bn/help/faq')).toEqual({ lang: 'bn', path: '/help/faq' });
    expect(splitLang('/bn')).toEqual({ lang: 'bn', path: '/' });
    expect(splitLang('/bnx')).toEqual({ lang: 'en', path: '/bnx' });
    expect(hrefIn('bn', '/')).toBe('/bn');
    expect(hrefIn('bn', '/help/faq')).toBe('/bn/help/faq');
    expect(hrefIn('bn', '/?theme=noir')).toBe('/bn?theme=noir');
    expect(hrefIn('en', '/help/faq')).toBe('/help/faq');
    expect(twinHref('en', '/journal')).toBe('/bn/journal');
    expect(twinHref('bn', '/journal')).toBe('/journal');
  });

  it('never touches the admin, the API or the progress page', () => {
    expect(isShopPath('/admin/products')).toBe(false);
    expect(isShopPath('/api/health')).toBe(false);
    expect(isShopPath('/status')).toBe(false);
    // PR 620: the ERP's signed calls are not shop pages (no language, no shop cache headers).
    expect(isShopPath('/erp-api/customers')).toBe(false);
    expect(isShopPath('/erp-apis')).toBe(true);
    expect(isShopPath('/checkout')).toBe(true);
    expect(isShopPath('/administrator')).toBe(true);
  });

  it('writes numbers and money in Bengali digits on the Bengali shop', () => {
    expect(toBnDigits('2026')).toBe('২০২৬');
    expect(formatNumber(1500, 'bn', true)).toBe('১,৫০০');
    expect(formatNumber(1500, 'bn', false)).toBe('1,500');
    expect(formatNumber(1500, 'en', true)).toBe('1,500');
    const en = formatMoney(150000, 'BDT', 'en', true);
    const bn = formatMoney(150000, 'BDT', 'bn', true);
    expect(en.endsWith('1,500')).toBe(true);
    expect(bn.endsWith('১,৫০০')).toBe(true);
    expect(en.slice(0, -5)).toBe(bn.slice(0, -5));
    expect(formatMoney(150050, 'BDT', 'en', true).endsWith('1,500.50')).toBe(true);
  });
});
