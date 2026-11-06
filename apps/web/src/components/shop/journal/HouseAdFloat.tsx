'use client';
// S12 · PR 592 (Blueprint C11.5 "popup rules") — an article's popup and slim bar. The popup opens on its trigger (read
// this far, this long on the page, or leaving at the top of the window), at most its cap's times in its days in this
// browser, never again after a close on this visit, and — with the search guard — never on the first screen for a
// phone visitor from a search engine (Google's intrusive-interstitial guidance). It closes with ✕, a tap outside or
// Esc; a bottom sheet on phones, a 420 px card on a desktop. Once it has opened, it replaces the slim bar for the visit.
// What the browser keeps (try/catch: a page without storage still works): the popup's show times, the visit's closes.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { capWindow, fromSearchSite, popupMayOpen, type PopupCap, type PopupRule } from '@/lib/journal/house-ads-model';

const PHONE = '(max-width: 767px)';
const shownKey = (id: string) => `ex-ha-shows:${id}`;
const closedKey = (id: string) => `ex-ha-closed:${id}`;
const POPPED = 'ex-ha-popped';

function read<T>(store: 'local' | 'session', key: string, d: T): T {
  try {
    const raw = (store === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
    return raw === null ? d : (JSON.parse(raw) as T);
  } catch {
    return d;
  }
}
function write(store: 'local' | 'session', key: string, v: unknown): void {
  try {
    (store === 'local' ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify(v));
  } catch {
    // no storage: the popup still keeps to this page view
  }
}

export interface FloatProps {
  popup: { id: string; rule: PopupRule; cap: PopupCap; node: ReactNode } | null;
  bar: { id: string; node: ReactNode } | null;
  /** The SEO organic list's search sites' match words. */
  searchWords: readonly string[];
  searchGuard: boolean;
  words: { close: string; popup: string };
}

export function HouseAdFloat({ popup, bar, searchWords, searchGuard, words }: FloatProps) {
  const [open, setOpen] = useState(false);
  const [barOn, setBarOn] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const done = useRef(false);

  useEffect(() => {
    // the browser's own memory is read after the page is drawn (the server cannot see it)
    if (!bar) return;
    const id = window.setTimeout(() => setBarOn(!read('session', closedKey(bar.id), false) && !read('session', POPPED, false)), 0);
    return () => window.clearTimeout(id);
  }, [bar]);

  useEffect(() => {
    if (!popup) return;
    const id = popup.id;
    const start = Date.now();
    let leaving = false;
    const fromSearch = fromSearchSite(document.referrer, searchWords);
    const phone = window.matchMedia(PHONE).matches;
    const check = () => {
      if (done.current) return;
      const now = Date.now();
      const doc = document.documentElement;
      const room = Math.max(1, doc.scrollHeight - window.innerHeight);
      const m = {
        readPct: Math.min(100, Math.round((window.scrollY / room) * 100)),
        seconds: (now - start) / 1000,
        leaving,
        pastFirstScreen: window.scrollY > window.innerHeight,
        phone,
        fromSearch,
        shownInWindow: capWindow(read<number[]>('local', shownKey(id), []), now, popup.cap.days).length,
        closedThisVisit: read('session', closedKey(id), false),
      };
      if (!popupMayOpen(popup.rule, popup.cap, m, searchGuard)) return;
      done.current = true;
      write('local', shownKey(id), [...capWindow(read<number[]>('local', shownKey(id), []), now, popup.cap.days), now]);
      write('session', POPPED, true);
      setBarOn(false);
      setOpen(true);
    };
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget) {
        leaving = true;
        check();
      }
    };
    window.addEventListener('scroll', check, { passive: true });
    document.addEventListener('mouseout', onLeave);
    const timer = window.setInterval(check, 1000); // hardcode-ok: how often the page looks at its own clock
    return () => {
      window.removeEventListener('scroll', check);
      document.removeEventListener('mouseout', onLeave);
      window.clearInterval(timer);
    };
  }, [popup, searchWords, searchGuard]);

  useEffect(() => {
    // room under the page while the slim bar shows, so the bar never covers the end of the page (the footer's links)
    if (!barOn) return;
    document.body.classList.add('ha-strip-on');
    return () => document.body.classList.remove('ha-strip-on');
  }, [barOn]);

  const close = useCallback(() => {
    if (popup) write('session', closedKey(popup.id), true);
    setOpen(false);
  }, [popup]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <>
      {open && popup ? (
        <div className="ha-over" onClick={(e) => e.target === e.currentTarget && close()} data-testid="house-ad-popup">
          <div className="ha-pop" role="dialog" aria-modal="true" aria-label={words.popup}>
            <button ref={closeRef} type="button" className="ha-x-btn" onClick={close} aria-label={words.close}>
              <span aria-hidden="true">✕</span>
            </button>
            {popup.node}
          </div>
        </div>
      ) : null}
      {barOn && bar ? (
        <div className="ha-strip" data-testid="house-ad-bar">
          {bar.node}
          <button
            type="button"
            className="ha-x-btn"
            onClick={() => {
              write('session', closedKey(bar.id), true);
              setBarOn(false);
            }}
            aria-label={words.close}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
