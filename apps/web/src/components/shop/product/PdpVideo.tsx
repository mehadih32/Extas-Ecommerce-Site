'use client';
// S28 · PR 681 — the product video on the product page: a poster picture with a play button at a fixed 4:5 shape (the page
// never jumps). The player — the provider's embed, or the shop's own clip — is made only when the customer taps play
// (`catalogue.video.playOnTap`), so the video costs the page nothing until it is wanted.
import { useState, type ReactNode } from 'react';

export interface PdpVideoWords {
  title: string;
  play: string;
  frame: string;
  open: string;
}

export function PdpVideo({
  kind,
  playUrl,
  watchUrl,
  provider,
  playOnTap,
  words,
  children,
}: {
  kind: 'embed' | 'file';
  playUrl: string;
  watchUrl: string | null;
  provider: string;
  playOnTap: boolean;
  words: PdpVideoWords;
  children: ReactNode;
}) {
  const [on, setOn] = useState(!playOnTap);
  return (
    <section className="pdp-video" aria-label={words.title} data-testid="pdp-video" data-provider={provider}>
      <div className="pdp-video-box">
        {on ? (
          kind === 'embed' ? (
            <iframe
              src={playUrl}
              title={words.frame}
              loading="lazy"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <video src={playUrl} controls playsInline autoPlay preload="metadata" aria-label={words.frame} />
          )
        ) : (
          <button type="button" className="pdp-video-poster" onClick={() => setOn(true)} aria-label={words.play} data-testid="pdp-video-play">
            {children}
            <span className="pdp-video-play" aria-hidden="true" />
          </button>
        )}
      </div>
      {watchUrl ? (
        <a className="xs muted pdp-video-open" href={watchUrl} target="_blank" rel="noopener noreferrer">
          {words.open}
        </a>
      ) : null}
    </section>
  );
}
