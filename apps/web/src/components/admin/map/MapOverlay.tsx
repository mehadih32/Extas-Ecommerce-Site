'use client';
// PR 1066 (prototype v5 `A.openMap`, core.js `#open-map`) — the Admin map opens as a full-screen overlay on the page the
// person is on, not in a new window or tab. Opened by the window event of shell/events.ts (the menu foot, the guide
// panel, the Help pages); closed by Close, Esc, or a tap on any page link (the person then goes there). The data comes
// from GET /api/admin/map (the same builder as /admin/map). /admin/map itself still works as a plain page (old links).
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAP_EVENT } from '@/components/admin/shell/events';
import { AdminMapScreen, type MapScreenProps } from './AdminMapScreen';
import '@/app/admin/s28.css';

interface Loaded {
  title: string;
  sub: string;
  props: MapScreenProps;
}

export function MapOverlay() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    document.body.style.overflow = '';
    const el = opener.current;
    opener.current = null;
    if (el instanceof HTMLElement) el.focus();
  }, []);

  useEffect(() => {
    const show = () => {
      opener.current = document.activeElement;
      setFailed(false);
      setOpen(true);
    };
    window.addEventListener(MAP_EVENT, show);
    return () => window.removeEventListener(MAP_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', esc);
    let live = true;
    fetch('/api/admin/map', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok: boolean } & Loaded) => {
        if (!live) return;
        if (j.ok) setData({ title: j.title, sub: j.sub, props: j.props });
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    queueMicrotask(() => box.current?.focus());
    return () => {
      live = false;
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [open, close]);

  if (!open) return null;
  return (
    <div
      ref={box}
      tabIndex={-1}
      className="lm-mapov"
      role="dialog"
      aria-modal="true"
      aria-label={data?.title}
      data-testid="admin-map-overlay"
      onClick={(e) => {
        // a tap on any page link closes the overlay; the link itself goes on to its page
        if ((e.target as HTMLElement).closest('a[href]')) close();
      }}
    >
      <div className="lm-mapov-in">
        {data ? (
          <>
            <div className="lm-mapov-head">
              <div>
                <h1 className="a2-h2">{data.title}</h1>
                <p className="a2-sm a2-mute">{data.sub}</p>
              </div>
            </div>
            <AdminMapScreen {...data.props} onClose={close} />
          </>
        ) : failed ? (
          <div className="a2-card a2-mt12" role="alert">
            <button type="button" className="a2-btn" onClick={close} data-testid="map-close">
              ×
            </button>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" aria-busy="true">
            …
          </p>
        )}
      </div>
    </div>
  );
}
