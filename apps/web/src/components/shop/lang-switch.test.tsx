// Follow-up 599 (PR 588) — while the owner sends Bengali visitors of a page that is not ready to its English twin
// (`language.bengali.gate` english), the English page's language switch does not offer a Bengali link that would only
// come straight back: it marks Bengali "coming soon" (no link). Every other case keeps the plain link of PR 84.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ShopContext } from '@/lib/shop/context';
import { LangSwitch } from './LangSwitch';

const ctx = (lang: 'en' | 'bn', path: string, s: Record<string, unknown> = {}) =>
  ({
    lang,
    path,
    t: (k: string) => k,
    s: { 'language.bengali.enabled': true, 'language.bengali.gate': { notReady: 'english' }, 'language.bengali.readyPages': ['home'], 'naming.productPathPrefix': 'products', ...s },
  }) as unknown as ShopContext;

describe('the language switch and the Bengali gate (follow-up 599)', () => {
  it('a ready page, or the gate as shipped (unlisted), keeps the link to the Bengali twin', () => {
    expect(renderToStaticMarkup(<LangSwitch c={ctx('en', '/')} />)).toContain('href="/bn"');
    const unlisted = renderToStaticMarkup(<LangSwitch c={ctx('en', '/collections/shirts', { 'language.bengali.gate': { notReady: 'unlisted' } })} />);
    expect(unlisted).toContain('href="/bn/collections/shirts"');
    expect(unlisted).not.toContain('data-bn-ready');
  });

  it('a page not ready while the gate sends visitors to English: Bengali marked "coming soon", no link', () => {
    const html = renderToStaticMarkup(<LangSwitch c={ctx('en', '/collections/shirts')} />);
    expect(html).not.toContain('href=');
    expect(html).toContain('data-bn-ready="no"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('lang.bnSoon');
    expect(html).toContain('data-testid="lang-switch"');
  });

  it('pages without a gate key (bag, checkout, search) and the Bengali page itself keep their link', () => {
    expect(renderToStaticMarkup(<LangSwitch c={ctx('en', '/bag')} />)).toContain('href="/bn/bag"');
    expect(renderToStaticMarkup(<LangSwitch c={ctx('bn', '/collections/shirts')} />)).toContain('href="/collections/shirts"');
    expect(renderToStaticMarkup(<LangSwitch c={ctx('en', '/', { 'language.bengali.enabled': false })} />)).toBe('');
  });
});
