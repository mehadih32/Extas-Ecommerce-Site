'use client';
// S10 · PR 216 — a notice pop-up on the storefront, obeying the standing pop-up rules (Blueprint B6.3, C11.5, D1):
//   - never on arrival: it opens after its seconds (counted only while the page is visible — hidden pauses the timer,
//     visible resumes it), after its scroll, when the visitor is leaving (desktop) or when an element with
//     `data-notice-open="<clickKey>"` is tapped;
//   - a phone visitor who came from a search engine never gets one on the first screen (it waits for a scroll);
//   - its frequency cap (per visit, day, week or ever) and the visit-wide limit hold (remembered in the browser; if the
//     browser keeps nothing, it simply shows at most once in this page view);
//   - it closes with ✕, a tap outside or Esc, and gives the focus back.
// No styling of its own: the storefront owner (S02) passes classes; the close button's label comes from the caller's
// messages. The decisions are the tested pure functions of @extas/rules/pure.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicNotice } from '@extas/rules';
import { capSchema, isSearchReferrer, pauseTimer, popupVerdict, resumeTimer, startTimer, timingSchema, timerRemaining, type SeenRecord, type VisibleTimer } from '@extas/rules/pure';

const SEEN_KEY = (id: string) => `extas.notice.${id}`;
const VISIT_KEY = 'extas.notice.visit';
const MS = 1000;
const WHOLE_PAGE = 100;

interface Visit {
  popups: number;
  shown: Record<string, number>;
}

function readVisit(): Visit {
  try {
    const v = JSON.parse(sessionStorage.getItem(VISIT_KEY) ?? 'null') as Visit | null;
    return v && typeof v.popups === 'number' ? v : { popups: 0, shown: {} };
  } catch {
    return { popups: 0, shown: {} };
  }
}

function readSeen(id: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY(id)) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function remember(id: string, at: Date) {
  try {
    const shown = [...readSeen(id), at.toISOString()].slice(-50);
    localStorage.setItem(SEEN_KEY(id), JSON.stringify(shown));
  } catch {
    /* the browser keeps nothing: this page view still shows it once at most */
  }
  try {
    const v = readVisit();
    sessionStorage.setItem(VISIT_KEY, JSON.stringify({ popups: v.popups + 1, shown: { ...v.shown, [id]: (v.shown[id] ?? 0) + 1 } }));
  } catch {
    /* as above */
  }
}

export interface RulePopupProps {
  notice: PublicNotice;
  popup: { maxPerVisit: number; searchHosts: string[] };
  closeLabel: string;
  /** What counts as a phone (the pop-up opens as a bottom sheet there; the search rule applies). */
  phoneQuery?: string;
  className?: string;
  backdropClassName?: string;
  closeClassName?: string;
  ctaClassName?: string;
}

export function RulePopup({ notice, popup, closeLabel, phoneQuery = '(max-width: 767px)', className, backdropClassName, closeClassName, ctaClassName }: RulePopupProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const done = useRef(false);
  const opener = useRef<Element | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const timing = useMemo(() => timingSchema.safeParse(notice.timing), [notice.timing]);
  const cap = useMemo(() => capSchema.safeParse(notice.frequencyCap), [notice.frequencyCap]);

  /** Opens it if every rule allows it now; false = not now (it may try again on a later scroll). */
  const tryOpen = useCallback((): boolean => {
    if (done.current) return true;
    const now = new Date();
    const isPhone = window.matchMedia(phoneQuery).matches;
    const visit = readVisit();
    const seen: SeenRecord = { shown: readSeen(notice.id), thisVisit: visit.shown[notice.id] ?? 0 };
    const verdict = popupVerdict(cap.success ? cap.data : null, seen, {
      now,
      isPhone,
      fromSearch: isSearchReferrer(document.referrer, popup.searchHosts),
      firstScreen: window.scrollY < window.innerHeight,
      popupsThisVisit: visit.popups,
      maxPerVisit: popup.maxPerVisit,
    });
    if (verdict === 'search-first-screen') return false;
    done.current = true;
    if (verdict !== 'show') return true;
    remember(notice.id, now);
    opener.current = document.activeElement;
    setPhone(isPhone);
    setOpen(true);
    return true;
  }, [notice.id, phoneQuery, popup.maxPerVisit, popup.searchHosts, cap]);

  useEffect(() => {
    if (!timing.success || !cap.success) return; // a pop-up without its rules never shows
    const t = timing.data;
    let waitingForScroll = false;
    const cleanups: (() => void)[] = [];
    const attempt = () => {
      if (!tryOpen()) waitingForScroll = true;
    };
    const onScroll = () => {
      if (done.current) return;
      const pct = ((window.scrollY + window.innerHeight) / Math.max(1, document.documentElement.scrollHeight)) * WHOLE_PAGE;
      if (t.trigger === 'scroll' && pct >= (t.scrollPercent ?? WHOLE_PAGE)) attempt();
      else if (waitingForScroll) attempt();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener('scroll', onScroll));

    if (t.trigger === 'time' && t.delaySeconds) {
      let timer: VisibleTimer = startTimer(t.delaySeconds * MS, Date.now(), document.visibilityState === 'visible');
      let handle: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        clearTimeout(handle);
        const left = timerRemaining(timer, Date.now());
        if (left === Infinity) return; // paused while hidden
        handle = setTimeout(attempt, left);
      };
      const onVisibility = () => {
        timer = document.visibilityState === 'visible' ? resumeTimer(timer, Date.now()) : pauseTimer(timer, Date.now());
        arm();
      };
      document.addEventListener('visibilitychange', onVisibility);
      arm();
      cleanups.push(() => {
        clearTimeout(handle);
        document.removeEventListener('visibilitychange', onVisibility);
      });
    }
    if (t.trigger === 'exit') {
      const onOut = (e: MouseEvent) => {
        if (!e.relatedTarget && e.clientY <= 0) attempt();
      };
      document.addEventListener('mouseout', onOut);
      cleanups.push(() => document.removeEventListener('mouseout', onOut));
    }
    if (t.trigger === 'click' && t.clickKey) {
      const onClick = (e: MouseEvent) => {
        const el = (e.target as Element | null)?.closest?.('[data-notice-open]');
        if (el && el.getAttribute('data-notice-open') === t.clickKey) attempt();
      };
      document.addEventListener('click', onClick);
      cleanups.push(() => document.removeEventListener('click', onClick));
    }
    return () => cleanups.forEach((c) => c());
  }, [tryOpen, timing, cap]);

  const close = useCallback(() => {
    setOpen(false);
    (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;
  return (
    <div className={backdropClassName} data-popup-backdrop="" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={className} role="dialog" aria-modal="true" aria-label={notice.title ?? notice.content} data-notice={notice.key ?? notice.id} data-sheet={phone ? 'bottom' : 'card'}>
        <button ref={closeBtn} type="button" className={closeClassName} aria-label={closeLabel} onClick={close}>
          ✕
        </button>
        {notice.title ? <strong>{notice.title}</strong> : null}
        <p>{notice.content}</p>
        {notice.cta ? (
          <a className={ctaClassName} href={notice.cta.href} onClick={close}>
            {notice.cta.label}
          </a>
        ) : null}
      </div>
    </div>
  );
}
