'use client';
// PR 73 — the results page's own search box (demo 21-category.js PAGES.search `.srch-form`, with 07-help-search.js's
// live suggestions under it): a plain form to the same page, so a new word starts a new search with the filters reset
// (demo D-016). While the words differ from the page's, the suggestions show under the box.
import { useState } from 'react';
import { Icon } from '../Icon';
import { hasAny, SuggestList, useSuggest } from './Suggest';
import type { SearchPanelProps } from '@/lib/shop/search-model';
import './search.css';

export function SearchForm({ q: start, p }: { q: string; p: SearchPanelProps }) {
  const [q, setQ] = useState(start);
  const w = p.words;
  const same = q.trim() === start.trim();
  const got = useSuggest(same ? '' : q, p);
  const a = got && got !== 'failed' && hasAny(got) ? got : null;
  return (
    <>
      <form className="srch-form" role="search" action={p.resultsUrl} method="get" data-testid="search-page-form">
        <label className="sr" htmlFor="srch-q">
          {w.label}
        </label>
        <input
          id="srch-q"
          name="q"
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={w.placeholder}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button className="btn btn-primary" aria-label={w.go}>
          <Icon name="search" size={18} />
          <span className="hide-m">{w.go}</span>
        </button>
      </form>
      {a ? (
        <form className="hs-sugg" role="search" action={p.resultsUrl} method="get" data-testid="search-suggest" aria-live="polite">
          <input type="hidden" name="q" value={q.trim()} />
          <SuggestList a={a} w={w} lang={p.lang} products={p.phoneProducts} />
        </form>
      ) : null}
    </>
  );
}
