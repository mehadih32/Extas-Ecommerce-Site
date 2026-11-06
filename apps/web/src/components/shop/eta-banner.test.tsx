// Follow-up 655 (PR 281) — the bag's strip carries the festive cut-off words: the Eid / holiday lines first, then the
// live festive rule's words read for checkout (the bag is its first step, no band known yet), never twice; the home
// page (no `festive`) never asks for them (its own festive section draws them). Nothing at all when both are empty.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopContext } from '@/lib/shop/context';

const calls: { place: string; locale?: string }[] = [];
let eta: string[] = [];
let festive: { key: string; name: string; text: string; state: 'open' | 'closed' }[] = [];
vi.mock('@/lib/rules-public', () => ({
  etaBanner: async () => eta,
  festiveLines: async (input: { place: string; locale?: string }) => {
    calls.push(input);
    return festive;
  },
}));
vi.mock('./Icon', () => ({ Icon: () => null }));

const { EtaBanner } = await import('./EtaBanner');
const c = (lang: 'en' | 'bn') => ({ storeId: 1, lang }) as unknown as ShopContext;
const draw = async (el: Promise<React.ReactElement | null>) => {
  const out = await el;
  return out ? renderToStaticMarkup(out) : '';
};

describe('EtaBanner — the festive cut-off words on the bag (follow-up 655)', () => {
  beforeEach(() => {
    calls.length = 0;
    eta = [];
    festive = [];
  });

  it('draws nothing while both are empty (as shipped)', async () => {
    expect(await draw(EtaBanner({ c: c('en'), testId: 'bag-eta', festive: true }))).toBe('');
    expect(calls).toEqual([{ storeId: 1, place: 'checkout', locale: 'en-BD' }]);
  });

  it('the bag: the Eid / holiday lines, then the festive words (checkout’s tick, in his language), never twice', async () => {
    eta = ['Order by 6 Mar for delivery before Eid'];
    festive = [
      { key: 'festive', name: 'Festival', text: 'Order by 3 Mar for delivery before the festival', state: 'open' },
      { key: 'eid', name: 'Eid', text: 'Order by 6 Mar for delivery before Eid', state: 'open' },
    ];
    const html = await draw(EtaBanner({ c: c('bn'), testId: 'bag-eta', festive: true }));
    expect(calls).toEqual([{ storeId: 1, place: 'checkout', locale: 'bn-BD' }]);
    expect(html).toContain('data-testid="bag-eta"');
    expect(html.match(/<p>/g)).toHaveLength(2);
    expect(html.indexOf('before Eid')).toBeLessThan(html.indexOf('before the festival'));
  });

  it('the home page never asks for the festive words (its own festive section draws them)', async () => {
    festive = [{ key: 'festive', name: 'Festival', text: 'Orders placed now arrive after the festival.', state: 'closed' }];
    expect(await draw(EtaBanner({ c: c('en'), testId: 'home-eta' }))).toBe('');
    expect(calls).toEqual([]);
  });
});
