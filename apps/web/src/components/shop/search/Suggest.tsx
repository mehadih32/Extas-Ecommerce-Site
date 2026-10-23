'use client';
// PR 72 — the live suggestions while the shopper types (demo 07-help-search.js INPUT['hs-suggest'], hs_suggestHTML, and
// D-014 dsk_srchBody): asked from `/search/suggest` a moment after the last key (`search.panel.debounceMs`, after
// `minChars` letters), each answer kept for the page's life, an older answer never drawn over a newer question. The
// phone window and the results page's box show a list (help, categories, products with picture and price, "See all");
// the computer's panel shows a 4-across grid with the help beside it.
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { ProductPicture } from '../ProductPicture';
import { waHref } from '@/lib/shop/links';
import { fillQ, type SearchChip, type SearchPanelProps, type SearchWords, type SuggestAnswer } from '@/lib/shop/search-model';

type Got = SuggestAnswer | 'failed';

/** The answer for `q` once it has come (null while typing, waiting, or under `minChars`). */
export function useSuggest(q: string, cfg: Pick<SearchPanelProps, 'suggestUrl' | 'debounceMs' | 'minChars'>): Got | null {
  const [got, setGot] = useState<Record<string, SuggestAnswer>>({});
  // a failed answer is not kept: the next key asks again
  const [failed, setFailed] = useState<string | null>(null);
  const term = q.trim();
  const enough = Array.from(term).length >= cfg.minChars;
  const have = enough ? got[term] : undefined;
  useEffect(() => {
    if (!enough || have) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`${cfg.suggestUrl}?q=${encodeURIComponent(term)}`, { signal: ctl.signal, headers: { accept: 'application/json' } });
        const body = r.ok ? ((await r.json()) as SuggestAnswer) : null;
        if (body && !body.failed) {
          setGot((g) => ({ ...g, [term]: body }));
          setFailed(null);
        } else setFailed(term);
      } catch {
        if (!ctl.signal.aborted) setFailed(term);
      }
    }, cfg.debounceMs);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [term, enough, have, cfg.suggestUrl, cfg.debounceMs]);
  if (!enough) return null;
  return have ?? (failed === term ? 'failed' : null);
}

export const hasAny = (a: SuggestAnswer) => a.help.length > 0 || a.products.length > 0 || a.categories.length > 0;

function HelpList({ a }: { a: SuggestAnswer }) {
  return (
    <div className="hs-list" data-testid="suggest-help">
      {a.help.map((h) => (
        <a key={h.slug} className="hs-item" href={h.href} data-testid={`help-${h.slug}`}>
          <span className="hs-ic">
            <Icon name={h.icon} size={18} />
          </span>
          <span className="hs-tx">
            <b>{h.title}</b>
            {h.answer ? <span className="hs-ans">{h.answer}</span> : null}
          </span>
          <span className="hs-go" aria-hidden="true">
            <Icon name="right" size={16} />
          </span>
        </a>
      ))}
    </div>
  );
}

function Chips({ list, testId }: { list: readonly SearchChip[]; testId?: string }) {
  return (
    <div className="hs-chips" data-testid={testId}>
      {list.map((k) => (
        <a key={k.href} className="chip" href={k.href}>
          {k.text}
        </a>
      ))}
    </div>
  );
}

function Price({ p }: { p: SuggestAnswer['products'][number] }) {
  return (
    <>
      <span className="price">{p.price}</span>
      {p.was ? (
        <>
          {' '}
          <span className="strike small">{p.was}</span>
        </>
      ) : null}
    </>
  );
}

const forWords = (w: SearchWords, a: SuggestAnswer) => (a.rest ? <span className="hs-for"> {fillQ(w.for, { q: a.rest })}</span> : null);

/** The phone window's and the results page's list. */
export function SuggestList({ a, w, lang, products }: { a: SuggestAnswer; w: SearchWords; lang: SearchPanelProps['lang']; products: number }) {
  const shown = a.products.slice(0, products);
  return (
    <>
      {a.help.length ? (
        <>
          <div className="hs-gh">{w.help}</div>
          <HelpList a={a} />
        </>
      ) : null}
      {a.categories.length ? (
        <>
          <div className="hs-gh">{w.categories}</div>
          <Chips list={a.categories.map((k) => ({ text: k.name, href: k.href }))} testId="suggest-categories" />
        </>
      ) : null}
      {shown.length ? (
        <>
          <div className="hs-gh">
            {w.products}
            {forWords(w, a)}
          </div>
          <div className="hs-list" data-testid="suggest-products">
            {shown.map((p) => (
              <a key={p.id} className="hs-item hs-prod" href={p.href}>
                <span className="hs-thumb">
                  <ProductPicture garment={p.garment} hex={p.hex} photo={p.photo} alt={p.name} lang={lang} sizes="40px" />
                </span>
                <span className="hs-tx">
                  <b>{p.name}</b>
                  <span className="hs-ans">
                    <Price p={p} />
                  </span>
                </span>
                <span className="hs-go" aria-hidden="true">
                  <Icon name="right" size={16} />
                </span>
              </a>
            ))}
          </div>
        </>
      ) : null}
      <button type="submit" className="hs-all" data-testid="suggest-all">
        <Icon name="search" size={15} />
        <span>{fillQ(w.seeAll, { q: a.q })}</span>
      </button>
    </>
  );
}

/** The computer's panel under the header: chips before typing, then the grid, the help and "See all N results". */
export function DeskBody({ q, got, p, num }: { q: string; got: Got | null; p: SearchPanelProps; num: (n: number) => string }) {
  const w = p.words;
  if (!q.trim() || !got) {
    if (q.trim() && !got) return null;
    const cols = [
      p.popular.length ? (
        <div key="p">
          <div className="dsk-s-h">{w.popular}</div>
          <Chips list={p.popular} />
        </div>
      ) : null,
      p.categories.length ? (
        <div key="c">
          <div className="dsk-s-h">{w.categories}</div>
          <Chips list={p.categories} />
        </div>
      ) : null,
    ].filter(Boolean);
    return cols.length ? <div className={`dsk-s-cols${cols.length === 1 ? ' one' : ''}`}>{cols}</div> : null;
  }
  if (got === 'failed') return <div className="dsk-s-none">{w.failed}</div>;
  const a = got;
  const prods = a.products.slice(0, p.desktopProducts);
  if (!hasAny(a)) {
    const wa = p.wa ? waHref(p.wa.number, fillQ(p.wa.message, { q: a.q })) : null;
    return (
      <div className="dsk-s-none" data-testid="dsk-search-none">
        <Icon name="search" size={18} />
        <span>
          {fillQ(w.none, { q: a.q })}
          {wa ? (
            <>
              {' '}
              <a href={wa} target="_blank" rel="noopener">
                {w.noneWa}
              </a>
            </>
          ) : null}
        </span>
      </div>
    );
  }
  const side =
    a.help.length || a.categories.length ? (
      <div className="dsk-s-help">
        {a.help.length ? (
          <>
            <div className="dsk-s-h">{w.help}</div>
            <HelpList a={a} />
          </>
        ) : null}
        {a.categories.length ? (
          <div className={a.help.length ? 'mt16' : undefined}>
            <div className="dsk-s-h">{w.categories}</div>
            <Chips list={a.categories.map((k) => ({ text: k.name, href: k.href }))} testId="suggest-categories" />
          </div>
        ) : null}
      </div>
    ) : null;
  const grid = prods.length ? (
    <div>
      <div className="dsk-s-h">
        {w.products}
        {forWords(w, a)} <span className="dsk-s-n">{num(a.total)}</span>
      </div>
      <div className="dsk-sgrid" data-testid="dsk-search-grid">
        {prods.map((x) => (
          <a key={x.id} className="dsk-sp" href={x.href}>
            <ProductPicture garment={x.garment} hex={x.hex} photo={x.photo} alt={x.name} lang={p.lang} sizes="240px" />
            <span className="dsk-spn">{x.name}</span>
            <span className="dsk-spp">
              <Price p={x} />
            </span>
          </a>
        ))}
      </div>
    </div>
  ) : (
    <div />
  );
  return (
    <>
      <div className={`dsk-s-res${side && prods.length ? ' two' : ''}`}>
        {grid}
        {side}
      </div>
      <button type="submit" className="hs-all dsk-s-all" data-testid="suggest-all">
        <Icon name="search" size={15} />
        <span>{a.total ? fillQ(w.seeAllN, { q: a.q, n: num(a.total) }) : fillQ(w.seeAll, { q: a.q })}</span>
      </button>
    </>
  );
}
