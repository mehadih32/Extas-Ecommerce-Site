// PR 84 — the language switch: a plain link to the same page in the other language (C12.1), so it works without
// JavaScript and a search engine finds both. It shows which language is on (demo 14.2 langPill()).
// Follow-up 599 (PR 588): while `language.bengali.gate` sends Bengali visitors of a page that is not ready to its
// English twin, the English page draws the same pill without a link, Bengali marked "coming soon" (a link would only
// come straight back). A page marked ready, or the gate as shipped (`unlisted`), keeps the link.
import { bengaliPageKey, sendToEnglish } from '@/lib/seo/bengali-gate';
import type { ShopContext } from '@/lib/shop/context';
import { twinHref } from '@/lib/shop/lang';

export function LangSwitch({ c }: { c: ShopContext }) {
  if (!c.s['language.bengali.enabled']) return null;
  const bn = c.lang === 'bn';
  const waits =
    !bn &&
    sendToEnglish({ lang: 'bn', bengaliOn: true, gate: c.s['language.bengali.gate'], ready: c.s['language.bengali.readyPages'], key: bengaliPageKey(c.path, c.s['naming.productPathPrefix']) });
  if (waits)
    return (
      <span className="langpill" data-lang={c.lang} data-bn-ready="no" data-testid="lang-switch" aria-disabled="true" title={c.t('lang.bnSoon')} aria-label={c.t('lang.bnSoon')}>
        <span className="lp-a on" lang="en">
          {c.t('lang.en')}
        </span>
        <span className="lp-s" aria-hidden="true">
          {c.t('lang.sep')}
        </span>
        <span className="lp-b lp-soon" lang="bn">
          {c.t('lang.bn')}
        </span>
      </span>
    );
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
