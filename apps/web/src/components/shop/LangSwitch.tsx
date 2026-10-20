// PR 84 — the language switch: a plain link to the same page in the other language (C12.1), so it works without
// JavaScript and a search engine finds both. It shows which language is on (demo 14.2 langPill()).
import type { ShopContext } from '@/lib/shop/context';
import { twinHref } from '@/lib/shop/lang';

export function LangSwitch({ c }: { c: ShopContext }) {
  if (!c.s['language.bengali.enabled']) return null;
  const bn = c.lang === 'bn';
  return (
    <a
      className="langpill"
      href={twinHref(c.lang, c.path)}
      hrefLang={bn ? 'en' : 'bn'}
      data-lang={c.lang}
      data-testid="lang-switch"
      aria-label={c.t(bn ? 'lang.toEn' : 'lang.toBn')}
    >
      <span className={`lp-a${bn ? '' : ' on'}`} lang="en">
        {c.t('lang.en')}
      </span>
      <span className="lp-s" aria-hidden="true">
        {c.t('lang.sep')}
      </span>
      <span className={`lp-b${bn ? ' on' : ''}`} lang="bn">
        {c.t('lang.bn')}
      </span>
    </a>
  );
}
