// PR 747 — the badge on a product card from the owner's `card.tagBadges`: nothing set keeps the first tag as it always was;
// the owner's order, a tag that never shows and his own words in both languages come on top.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { cardBadge } from './home-model';
import { pickBadge } from './tag-badge';

const tags = [
  { slug: 'new', name: 'New' },
  { slug: 'bestseller', name: 'Bestseller' },
  { slug: 'limited', name: 'Limited' },
];
const none = registry['card.tagBadges'].default;

describe('PR 747 · tag badges', () => {
  it('nothing set: the first tag in its own name, as before', () => {
    expect(pickBadge(tags, none)).toEqual({ en: 'New', bn: 'New' });
    expect(pickBadge(tags, undefined)).toEqual({ en: 'New', bn: 'New' });
    expect(pickBadge([], none)).toBeNull();
  });

  it('the owner\'s order: placed tags first, the others after in their own order', () => {
    expect(pickBadge(tags, { ...none, order: ['limited', 'new'] })?.en).toBe('Limited');
    expect(pickBadge(tags.slice(0, 2), { ...none, order: ['limited'] })?.en).toBe('New');
  });

  it('a hidden tag never shows; when all are hidden there is no badge', () => {
    expect(pickBadge(tags, { ...none, hidden: ['new'] })?.en).toBe('Bestseller');
    expect(pickBadge(tags, { ...none, hidden: ['new', 'bestseller', 'limited'] })).toBeNull();
  });

  it('his own words replace the tag\'s name, per language', () => {
    const cfg = { ...none, labels: { new: { en: 'Fresh', bn: 'নতুন' } } };
    expect(pickBadge(tags, cfg)).toEqual({ en: 'Fresh', bn: 'নতুন' });
  });

  it('the card draws the Bengali words in Bengali and never replaces a sale badge', () => {
    const t = ((k: string) => k) as never;
    const num = (n: number) => String(n);
    const card = { priceMinor: 1000, wasMinor: null, badge: 'Fresh', badgeBn: 'নতুন' };
    expect(cardBadge(card, t, num, 'bn')).toEqual({ text: 'নতুন', sale: false });
    expect(cardBadge(card, t, num)).toEqual({ text: 'Fresh', sale: false });
    expect(cardBadge({ ...card, wasMinor: 2000 }, t, num, 'bn')?.sale).toBe(true);
  });
});
