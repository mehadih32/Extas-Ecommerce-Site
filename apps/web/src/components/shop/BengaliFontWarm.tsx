'use client';
// Follow-up 23 (PR 82) — puts the shop's Bengali font files into the browser's cache once a Bengali page is idle, then
// sets the cookie that lets the next page declare them (lib/shop/font-preload.ts). Never on Save-Data; nothing drawn.
import { useEffect } from 'react';

type Props = { urls: string[]; cookie: string; maxAgeSeconds: number };

export function BengaliFontWarm({ urls, cookie, maxAgeSeconds }: Props) {
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    let gone = false;
    let idle = 0;
    const warm = () => {
      if (gone) return;
      Promise.all(urls.map((u) => fetch(u, { credentials: 'same-origin' }).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))))
        .then(() => {
          if (gone) return;
          const secure = location.protocol === 'https:' ? ';Secure' : '';
          document.cookie = `${cookie}=1;Path=/;Max-Age=${maxAgeSeconds};SameSite=Lax${secure}`;
        })
        .catch(() => undefined); // a failed fetch leaves the phone's own Bengali font, as before
    };
    const later = () => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) idle = ric(warm, { timeout: 4000 }); // hardcode-ok: technical, the idle wait's upper bound in ms
      else idle = window.setTimeout(warm, 1500); // hardcode-ok: technical, a pause after load where idle is unknown
    };
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, { once: true });
    return () => {
      gone = true;
      window.removeEventListener('load', later);
      const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (cic) cic(idle);
      window.clearTimeout(idle);
    };
  }, [urls, cookie, maxAgeSeconds]);
  return null;
}
