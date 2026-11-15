'use client';
// Website › Control — the grouped cards with one search box (owner request, 15 Nov 2026). Typing narrows the cards by their
// title, line and search words in the person's language; a group with no match disappears; nothing is saved here. Every
// card is a plain link to the page where the setting lives (the server already left out what the person may not open).
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cardMatches, type ControlGroup } from '@/lib/admin-website-control/cards';

export interface ControlTexts {
  search: string;
  searchLabel: string;
  count: string;
  none: string;
  open: string;
  clear: string;
  groups: Record<string, string>;
  cards: Record<string, { t: string; d: string; k: string }>;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

export function ControlHub({ groups, texts }: { groups: ControlGroup[]; texts: ControlTexts }) {
  const [q, setQ] = useState('');
  const shown = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, cards: g.cards.filter((c) => cardMatches(texts.cards[c.id] ?? { t: c.id, d: '', k: '' }, q)) }))
        .filter((g) => g.cards.length > 0),
    [groups, texts.cards, q],
  );
  const total = shown.reduce((n, g) => n + g.cards.length, 0);
  return (
    <div className="wc-hub" data-testid="wc-hub">
      <div className="wc-find">
        <input
          className="a2-inp wc-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={texts.search}
          aria-label={texts.searchLabel}
          autoComplete="off"
          data-testid="wc-search"
        />
        {q ? (
          <button type="button" className="a2-btn wc-clear" onClick={() => setQ('')}>
            {texts.clear}
          </button>
        ) : null}
        <span className="wc-count a2-sub" role="status" aria-live="polite" data-testid="wc-count">
          {fill(texts.count, { n: total })}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="a2-note a2-mt12" role="status" data-testid="wc-none">
          {fill(texts.none, { q: q.trim() })}
        </p>
      ) : (
        shown.map((g) => (
          <section key={g.id} className="wc-group" aria-labelledby={`wc-g-${g.id}`} data-testid={`wc-group-${g.id}`}>
            <h2 className="wc-gh" id={`wc-g-${g.id}`}>
              {texts.groups[g.id] ?? g.id}
            </h2>
            <ul className="wc-cards">
              {g.cards.map((c) => {
                const w = texts.cards[c.id] ?? { t: c.id, d: '', k: '' };
                return (
                  <li key={c.id}>
                    <Link className="a2-card wc-card" href={c.href} data-testid={`wc-card-${c.id}`}>
                      <span className="wc-ct">{w.t}</span>
                      <span className="wc-cd">{w.d}</span>
                      <span className="wc-go" aria-hidden="true">
                        {texts.open} →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
