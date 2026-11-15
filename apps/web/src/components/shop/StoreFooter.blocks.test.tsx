// PR 745 — the footer's boxes in the owner's own order. Not set (as shipped): the footer carries no `data-blocks` and no
// inline order, so it is the approved footer. Set: the footer is a column of boxes, each with its own CSS order; a box left
// out is not drawn; the last line (copyright, language switch) always stays.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { storefrontSettings } from '@extas/settings';
import type { ShopContext } from '@/lib/shop/context';
import { shopT } from '@/lib/shop/dict';
import { StoreFooter } from './StoreFooter';

vi.mock('./ShopLogo', () => ({ ShopLogo: ({ fallback }: { fallback: unknown }) => fallback }));

const footer = storefrontSettings['shell.footer'].default;

function ctx(over: Record<string, unknown> = {}): ShopContext {
  const t = shopT('en');
  return {
    lang: 'en',
    path: '/',
    t,
    s: {
      'shell.footer': footer,
      'shell.desktopNav': storefrontSettings['shell.desktopNav'].default,
      'brand.slogan': null,
      'brand.logoStyle': 0,
      'brand.logoSize': { desk: 36, phone: 28, footer: 32 },
      'contact.phone': '+8801700000000',
      'contact.whatsapp': '+8801700000000',
      'contact.email': null,
      'contact.hours': null,
      'social.facebook': 'https://example.test/fb',
      'social.instagram': null,
      'social.youtube': null,
      'social.tiktok': null,
      'legal.dbid': null,
      'legal.tradeLicence': null,
      'language.bengali.enabled': false,
      'language.bengali.gate': { notReady: 'unlisted' },
      'language.bengali.readyPages': [],
      'naming.productPathPrefix': 'products',
      ...over,
    },
    storeName: 'Sample Shop',
    flags: { cod: true, freeDelivery: true, exchange: true, whatsapp: true, hotline: true, signupList: false },
    vars: { store: 'Sample Shop', year: '2026' },
    cats: [],
  } as unknown as ShopContext;
}

const draw = (blockOrder?: readonly string[], desktop = footer.desktop) =>
  renderToStaticMarkup(<StoreFooter c={ctx({ 'shell.footer': { ...footer, desktop, ...(blockOrder ? { blockOrder } : {}) } })} pay={['cod', 'bkash']} />);

const orderOf = (html: string, cls: string) => {
  const m = new RegExp(`class="ftr-s ${cls}"[^>]*style="order:(\\d+)"`).exec(html);
  return m ? Number(m[1]) : null;
};

describe('the footer boxes in the owner`s order (PR 745)', () => {
  it('as shipped: no data-blocks, no inline order, every box drawn', () => {
    const html = draw();
    expect(html).not.toContain('data-blocks');
    expect(html).not.toContain('style="order');
    for (const cls of ['ftr-s1', 'ftr-s2', 'ftr-s3', 'ftr-s4', 'ftr-s5']) expect(html).toContain(`ftr-s ${cls}`);
  });

  it('an order puts each box in its place with a CSS order and splits the contact band in three', () => {
    const html = draw(['pay', 'social', 'contact', 'columns', 'brand', 'promise', 'legal']);
    expect(html).toContain('data-blocks');
    expect(orderOf(html, 'ftr-s5')).toBe(70);
    expect(html.match(/ftr-s ftr-s4/g)).toHaveLength(3);
    const orders = [...html.matchAll(/class="ftr-s ftr-s4"[^>]*style="order:(\d+)"/g)].map((m) => Number(m[1]));
    expect(orders).toEqual([30, 20, 10]);
  });

  it('a box left out is not drawn, but the last line stays', () => {
    const html = draw(['columns', 'legal']);
    expect(html).toContain('ftr-s ftr-s3');
    expect(html).toContain('ftr-s ftr-s5');
    expect(html).not.toContain('ftr-s ftr-s1');
    expect(html).not.toContain('ftr-s ftr-s2');
    expect(html).not.toContain('ftr-s ftr-s4');
    expect(html).not.toContain('ftr-wa');
  });

  it('the computer footer hides the boxes left out and sits where its first box stands', () => {
    const html = draw(['promise', 'social', 'legal'], true);
    expect(html).toContain('data-testid="ftr-desk"');
    expect(html).toContain('style="order:20"');
    expect(html).not.toContain('fdr-wa');
    expect(html).not.toContain('fdr-pay');
    expect(html).toContain('fdr-soc');
    const none = draw(['promise', 'legal'], true);
    expect(none).not.toContain('data-testid="ftr-desk"');
  });
});
