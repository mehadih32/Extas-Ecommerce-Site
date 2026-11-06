import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PdpGiftNeedSize } from '@/components/shop/product/PdpBuy';
import { giftCheckoutHref } from './gift-link';

describe('"Send as a gift" on the product page (follow-up 210)', () => {
  it('opens the checkout as a gift only while gift mode is on', () => {
    expect(giftCheckoutHref('/checkout', true)).toBe('/checkout?gift=1');
    expect(giftCheckoutHref('/bn/checkout', true)).toBe('/bn/checkout?gift=1');
    expect(giftCheckoutHref('/checkout?x=1', true)).toBe('/checkout?x=1&gift=1');
    expect(giftCheckoutHref('/checkout', false)).toBeNull();
  });

  it('with no size chosen the link is a button that asks for the size (the bag gets nothing yet)', () => {
    const html = renderToStaticMarkup(<PdpGiftNeedSize label="Send as a gift" onNeedSize={() => undefined} />);
    expect(html).toContain('<button type="button" class="pdp-gift"');
    expect(html).toContain('data-testid="pdp-gift"');
    expect(html).toContain('Send as a gift');
  });
});
