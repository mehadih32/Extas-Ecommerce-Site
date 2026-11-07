// Follow-up 697 (PR 598, a37 browser check with a sample set-tier rule) — Products › Combos › Bag tier box: a tier's
// count is written in the admin's own digits, like the price and the product count beside it ("২টা নিন · ১,৫০০৳" in
// Bengali, never "2টা নিন · ১,৫০০৳"); the "How many tiers" choices too.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../messages/admin-bagbox.bn.json';
import en from '../../../../messages/admin-bagbox.en.json';
import { BagBoxEditor, type BoxRule } from './BagBoxEditor';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const box = { enabled: true, startsOn: null, endsOn: null, max: 3, phonePreview: true, rules: { hidden: [], labels: {} } };
const rulesIn = (lang: 'en' | 'bn'): BoxRule[] => [{ key: 'any-polos', name: 'Sample · Any polos', state: 'running', covers: '', days: '', tiers: [{ quantity: 2, price: lang === 'bn' ? '১,৫০০৳' : 'Tk 1,500' }, { quantity: 3, price: lang === 'bn' ? '২,১০০৳' : 'Tk 2,100' }] }] as never;
const dictOf = (d: unknown) => ((d as { bb?: unknown }).bb ?? {}) as never;
const draw = (lang: 'en' | 'bn', locale?: string) => renderToStaticMarkup(<BagBoxEditor box={box as never} version="v1" rules={rulesIn(lang)} rulesHref="/admin/rules" canEdit lang={lang} w={dictOf(lang === 'bn' ? bn : en)} locale={locale} />);

describe('follow-up 697: the bag tier box writes counts in the admin`s digits', () => {
  it('Bengali: the tier counts and the tier choices in Bengali digits', () => {
    const html = draw('bn', 'bn-BD');
    expect(html).toContain('২');
    expect(html).toContain('৩');
    expect(html).not.toMatch(/>\s*2\s*</);
    expect(html).not.toMatch(/2টা|3টা/);
  });
  it('English stays in Western digits; without a locale nothing changes', () => {
    expect(draw('en', 'en-BD')).not.toContain('২');
    expect(draw('bn')).toMatch(/2/);
  });
});
