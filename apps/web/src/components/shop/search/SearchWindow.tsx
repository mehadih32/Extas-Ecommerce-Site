'use client';
// PR 72 — the search window itself, loaded on the first open (SearchPanel), so no page carries its code until a shopper
// asks for it: the phone's bottom window or the computer's panel under the header, the live suggestions, Esc, the
// close button, a press outside, the keyboard kept inside, the page under it held still.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { DESK, OPENER, type Mode } from './search-open';
import { DeskBody, hasAny, SuggestList, useSuggest } from './Suggest';
import { toBnDigits } from '@/lib/shop/lang';
import type { SearchPanelProps } from '@/lib/shop/search-model';
import './search.css';

export default function SearchWindow({ p, mode, host, close }: { p: SearchPanelProps; mode: Mode; host: HTMLElement; close: (focusBack: boolean) => void }) {
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const w = p.words;
  const num = useCallback((n: number) => (p.lang === 'bn' && p.bnDigits ? toBnDigits(String(n)) : String(n)), [p.lang, p.bnDigits]);
  const got = useSuggest(q, p);

  useEffect(() => {
    if (!mode) return;
    input.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
        return;
      }
      if (mode === 'modal' && e.key === 'Tab' && box.current) {
        // keep the keyboard inside the window while it is open
        const f = Array.from(box.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(
          (x) => x.getClientRects().length > 0,
        );
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    // the computer's panel: a press anywhere else closes it (the icon itself toggles it, above)
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || box.current?.contains(t) || t.closest?.(OPENER)) return;
      close(false);
    };
    // a window made narrow under an open panel: the panel's place is gone, so it closes
    const mq = window.matchMedia(DESK);
    const onWidth = () => {
      if (!mq.matches) close(false);
    };
    document.addEventListener('keydown', onKey);
    if (mode === 'desk') {
      document.addEventListener('pointerdown', onDown);
      mq.addEventListener('change', onWidth);
    }
    let raf = 0;
    const prev = document.body.style.overflow;
    // after any other window's own clean-up (the phone menu closing as this opens) has run
    if (mode === 'modal') raf = requestAnimationFrame(() => (document.body.style.overflow = 'hidden'));
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      mq.removeEventListener('change', onWidth);
      cancelAnimationFrame(raf);
      if (mode === 'modal') document.body.style.overflow = prev === 'hidden' ? '' : prev;
    };
  }, [mode, close]);

  if (mode === 'desk') {
    return createPortal(
      <div ref={box} className="dsk-srch" role="dialog" aria-label={w.title} data-testid="dsk-search">
        <div className="container">
          <form className="dsk-s-form" role="search" action={p.resultsUrl} method="get" data-testid="search-form">
            <label className="sr" htmlFor="q-d">
              {w.label}
            </label>
            <Icon name="search" size={20} />
            <input
              ref={input}
              id="q-d"
              name="q"
              className="dsk-s-in"
              placeholder={w.deskPlaceholder}
              autoComplete="off"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="search-input"
            />
            <button type="button" className="iconbtn dsk-s-x" aria-label={w.close} onClick={() => close(true)}>
              <Icon name="close" size={18} />
            </button>
            <div className="dsk-s-body" aria-live="polite">
              <DeskBody q={q} got={got} p={p} num={num} />
            </div>
          </form>
        </div>
      </div>,
      host,
    );
  }

  const a = got && got !== 'failed' && hasAny(got) ? got : null;
  return createPortal(
    <div
      className="modal-back"
      onClick={(e) => {
        if (e.target === e.currentTarget) close(true);
      }}
    >
      <div ref={box} className="modal srch-modal" role="dialog" aria-modal="true" aria-label={w.title} tabIndex={-1} data-testid="search-window">
        <div className="modal-hd">
          <div className="h3" style={{ fontSize: 17 }}>
            {w.title}
          </div>
          <button className="iconbtn" aria-label={w.close} onClick={() => close(true)}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-bd">
          <form className={a ? 'hs-on' : undefined} role="search" action={p.resultsUrl} method="get" data-testid="search-form">
            <label className="label" htmlFor="q-m">
              {w.label}
            </label>
            <div className="row srch-row">
              <input
                ref={input}
                id="q-m"
                name="q"
                className="input"
                placeholder={w.placeholder}
                autoComplete="off"
                enterKeyHint="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="search-input"
              />
              <button className="btn btn-primary">{w.go}</button>
            </div>
            <div className="hs-sugg" data-testid="search-suggest" aria-live="polite" hidden={!a && got !== 'failed'}>
              {a ? <SuggestList a={a} w={w} lang={p.lang} products={p.phoneProducts} /> : got === 'failed' ? <p className="hs-fail small text2">{w.failed}</p> : null}
            </div>
            {!a && (p.popular.length || p.categories.length) ? (
              <div className="srch-chips mt12" data-testid="search-chips">
                {(p.popular.length ? p.popular : p.categories).map((k) => (
                  <a key={k.href} className="chip" href={k.href}>
                    {p.popular.length ? <Icon name="search" size={14} /> : null}
                    {k.text}
                  </a>
                ))}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>,
    host,
  );
}
