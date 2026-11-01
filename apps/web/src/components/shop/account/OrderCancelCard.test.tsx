// PR 144 follow-up (go-live gate customer 360°, 1 Nov) — the order page's cancel card: the button matches the owner's
// rule for this order (one tap, or a request the team answers), "you asked" has no button, and every word is in both
// languages. Every value is a made-up test value.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../messages/shop-account.bn.json';
import en from '../../../../messages/shop-account.en.json';
import { OrderCancelCard, type CancelMode } from './OrderCancelCard';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const words = en.account.cancel as Record<string, string>;
const reasons = [{ key: 'changed-mind', label: 'Changed my mind' }];
const draw = (mode: CancelMode, paid = false) => renderToStaticMarkup(<OrderCancelCard words={words} number="EX-1" mode={mode} reasons={reasons} paid={paid} />);

describe('the order page cancel card (PR 144 follow-up)', () => {
  it('a one-tap cancel opens with "Cancel order"', () => {
    const html = draw('tap');
    expect(html).toContain('data-mode="tap"');
    expect(html).toContain(words.open);
    expect(html).toContain(words.tapText);
    expect(html).not.toContain(words.openRequest);
  });

  it('after the cut-off it is a request the team answers', () => {
    const html = draw('request');
    expect(html).toContain(words.openRequest);
    expect(html).toContain(words.requestText);
  });

  it('once asked, it only says so (no second request)', () => {
    const html = draw('requested');
    expect(html).toContain(words.requested);
    expect(html).not.toContain('data-testid="order-cancel-open"');
  });

  it('nothing is sent on the first tap: the reasons and the "Yes" are not drawn until he opens it', () => {
    const html = draw('tap', true);
    expect(html).not.toContain('order-cancel-confirm');
    expect(html).not.toContain('order-cancel-reason');
  });

  it('every word is in Bengali too', () => {
    const b = bn.account.cancel as Record<string, string>;
    expect(Object.keys(b).sort()).toEqual(Object.keys(words).sort());
    for (const k of Object.keys(b)) expect(b[k]!.trim().length).toBeGreaterThan(0);
  });
});
