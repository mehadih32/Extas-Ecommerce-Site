'use client';
// S02 · PR 595 — Website › Page layouts' preview (demo "live phone + desktop preview"): the shop page as it is now, on a
// phone (390 px) and on a computer (1366 px), side by side and scaled down. It loads only when asked (two shop pages are
// heavy) and reloads after every Save (`stamp` = the layout's version).
import { useState } from 'react';

export function LayoutPreview({ src, stamp, w }: { src: string; stamp: string; w: { show: string; hide: string; phone: string; desktop: string; note: string } }) {
  const [on, setOn] = useState(false);
  return (
    <div className="lyb-prevw">
      <button type="button" className="lm-btn" aria-expanded={on} onClick={() => setOn(!on)} data-testid="ly-preview">
        {on ? w.hide : w.show}
      </button>
      {on ? (
        <>
          <p className="lm-hint">{w.note}</p>
          <div className="lyb-prev lm-in" key={stamp}>
            <figure className="lyb-fig">
              <figcaption className="lm-hint">{w.phone}</figcaption>
              <div className="lyb-frame ph">
                <iframe src={src} title={w.phone} loading="lazy" tabIndex={-1} />
              </div>
            </figure>
            <figure className="lyb-fig">
              <figcaption className="lm-hint">{w.desktop}</figcaption>
              <div className="lyb-frame dk">
                <iframe src={src} title={w.desktop} loading="lazy" tabIndex={-1} />
              </div>
            </figure>
          </div>
        </>
      ) : null}
    </div>
  );
}
