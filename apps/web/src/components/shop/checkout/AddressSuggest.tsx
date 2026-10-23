'use client';
// PR 117 / 552 · follow-up 57 — the places under the checkout's address box while he types (Blueprint register PR 552:
// "each suggestion row shows the parent and the price"; GET /api/delivery/suggest, `delivery.suggest.*`).
// - The box stays a plain text box (its role is textbox): `aria-autocomplete="list"`, `aria-controls` the list and
//   `aria-activedescendant` the row the arrows are on; a polite line says how many places were found.
// - Keyboard: ↓ / ↑ move through the rows, Enter picks the row the arrows are on (otherwise Enter is a new line), Escape
//   closes the list, Tab or leaving the box closes it. Mouse and touch: a tap picks (the box keeps the focus).
// - A pick writes "place, district" in place of the part being typed and reads the address at once (no waiting for the
//   pause: he finished it). Nothing is asked below `delivery.suggest.minChars` letters; a slow or failed answer just
//   shows no rows, and only the newest answer is drawn.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { applyPick, fetchRows, fragmentOf, lookupsOf, rowView, wantsRows, type Fragment, type SuggestView } from '@/lib/shop/address-suggest';

export interface SuggestConfig {
  minChars: number;
  storeId: number;
  lang: 'en' | 'bn';
  words: { label: string; count: string };
  /** The charge as the page writes money. */
  money: (minor: number) => string;
  n: (x: number) => string;
}

interface Open {
  rows: SuggestView[];
  at: Fragment;
}

export function useAddressSuggest(cfg: SuggestConfig | null, onPick: (line: string, caret: number) => void) {
  const [open, setOpen] = useState<Open | null>(null);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const ctl = useRef<AbortController | null>(null);
  const picked = useRef<string | null>(null);
  useEffect(
    () => () => {
      ctl.current?.abort();
    },
    [],
  );

  const close = () => {
    seq.current++;
    ctl.current?.abort();
    setOpen(null);
    setActive(-1);
  };

  const input = (line: string, caret: number) => {
    if (!cfg) return;
    const f = fragmentOf(line, caret);
    if (!wantsRows(line, f, cfg.minChars, picked.current)) return close();
    picked.current = null;
    const k = ++seq.current;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    void (async () => {
      for (const at of lookupsOf(line, f)) {
        if ([...at.query].length < cfg.minChars) continue;
        const rows = await fetchRows(at.query, cfg.storeId, c.signal);
        if (k !== seq.current) return;
        if (rows.length) {
          setOpen({ rows: rows.map((r) => rowView(r, cfg.lang)), at });
          setActive(-1);
          return;
        }
      }
      if (k === seq.current) {
        setOpen(null);
        setActive(-1);
      }
    })();
  };

  const pick = (line: string, row: SuggestView) => {
    if (!open) return;
    const next = applyPick(line, open.at, row.text);
    picked.current = next.line;
    close();
    onPick(next.line, next.caret);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open?.rows.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = open.rows.length;
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0 && open.rows[active]) {
      e.preventDefault();
      pick(e.currentTarget.value, open.rows[active]!);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') close();
  };

  const listId = 'co-addr-list';
  const optId = (i: number) => `co-addr-opt-${i}`;
  const shown = !!open?.rows.length;
  const boxProps = cfg
    ? {
        'aria-autocomplete': 'list' as const,
        'aria-controls': listId,
        'aria-activedescendant': shown && active >= 0 ? optId(active) : undefined,
        onKeyDown,
      }
    : {};

  const list = (line: string) =>
    cfg ? (
      <>
        <div className="sr" aria-live="polite">
          {shown ? fillCount(cfg.words.count, cfg.n(open!.rows.length)) : ''}
        </div>
        <ul id={listId} className="co-sug" role="listbox" aria-label={cfg.words.label} hidden={!shown} data-testid="co-sug">
          {shown
            ? open!.rows.map((r, i) => (
                <li
                  key={r.id}
                  id={optId(i)}
                  role="option"
                  aria-selected={i === active}
                  className={`co-sug-o${i === active ? ' on' : ''}`}
                  data-testid="co-sug-row"
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(line, r)}
                >
                  <span className="co-sug-n">{r.name}</span>
                  {r.parent ? <span className="co-sug-p">{r.parent}</span> : null}
                  {r.chargeMinor !== null ? <span className="co-sug-c">{cfg.money(r.chargeMinor)}</span> : null}
                </li>
              ))
            : null}
        </ul>
      </>
    ) : null;

  return { input, close, boxProps, list };
}

function fillCount(text: string, n: string): string {
  return text.replace('{n}', n);
}
