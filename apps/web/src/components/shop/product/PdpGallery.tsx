'use client';
// PR 54 — the product photos (Blueprint D3.5, demo 30-product.js pdp_galleryT1 / pdp_track / pdp_thumbs): one native
// scroll-snap strip per colour, so a swipe follows the finger and costs no redraw; the ‹ › buttons and the thumbnails
// scroll the same strip and the strip's position is the one truth for which photo is showing (demo P1). The first photo
// carries the tag or the discount and, on its own switch, the "Only N left" line where the eye lands first (39). A tap,
// a double tap or a two-finger touch opens the full-screen viewer (PR 54 · 31-zoom.js).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { nearestTile, stepTo, thumbsShown } from '@/lib/shop/pdp-gallery';
import { lowStock } from '@/lib/shop/pdp-stock';
import { NO_COLOUR, type PdpShot } from '@/lib/shop/product-model';
import { usePdp } from './PdpRoot';
import { PdpZoom } from './PdpZoom';
import { ShotPicture } from './ShotPicture';

export interface GalleryBadge {
  text: string;
  sale: boolean;
}

export function PdpGallery({ badge, lang }: { badge: GalleryBadge | null; lang: 'en' | 'bn' }) {
  const { m, set, choice, w, num } = usePdp();
  const key = choice.colour ?? NO_COLOUR;
  const shots: PdpShot[] = m.shots[key] ?? m.shots[NO_COLOUR] ?? [];
  const colour = m.colours.find((c) => c.key === choice.colour) ?? null;
  const hex = colour?.hex ?? '';
  const trk = useRef<HTMLDivElement>(null);
  // the photo showing, per colour (a new colour starts on its first photo)
  const [at, setAt] = useState({ key, i: 0 });
  const idx = at.key === key ? at.i : 0;
  const setIdx = useCallback((i: number) => setAt({ key, i }), [key]);
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  const raf = useRef(0);

  // a new colour's strip starts at its first photo, with no animation
  useEffect(() => {
    trk.current?.scrollTo({ left: 0 });
  }, [key]);

  const go = useCallback((i: number, smooth = true) => {
    const t = trk.current;
    const tile = t?.children[i] as HTMLElement | undefined;
    if (!t || !tile) return;
    try {
      t.scrollTo({ left: tile.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
    } catch {
      t.scrollLeft = tile.offsetLeft;
    }
    if (!smooth) setIdx(i);
  }, [setIdx]);

  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const t = trk.current;
      if (!t) return;
      setIdx(nearestTile(Array.from(t.children, (c) => (c as HTMLElement).offsetLeft), t.scrollLeft));
    });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // computer, thumbnails down the side: as many as fit beside the photo, up to the owner's number (demo P8)
  const mainRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<number | null>(null);
  const side = set.gallery.thumbsDesktop === 'side';
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const measure = () => {
      const main = mainRef.current;
      const first = thumbsRef.current?.querySelector<HTMLElement>('.pdp-thumb');
      if (!mq.matches || !side || !main || !first) return setFit(null);
      const gap = 8;
      const h0 = first.getBoundingClientRect().height || 90;
      setFit(Math.max(2, Math.floor((main.getBoundingClientRect().height + gap) / (h0 + gap))));
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (mainRef.current) ro?.observe(mainRef.current);
    mq.addEventListener('change', measure);
    return () => {
      ro?.disconnect();
      mq.removeEventListener('change', measure);
    };
  }, [side, key]);

  const name = m.name;
  const colourName = colour?.name ?? '';
  const altOf = (s: PdpShot) => (colourName ? w('alt', { name, colour: colourName, view: w(`view.${s.kind}`) }) : `${name}, ${w(`view.${s.kind}`)}`);
  const low = set.stock.lowChip ? lowStock(m, choice, set.stock.lowAt) : null;
  const lowText = low ? w(low.kind === 'lowSize' ? 'stock.lowSize' : 'stock.low', { n: num(low.n), colour: colourName, size: m.sizes.find((s) => s.key === choice.size)?.label ?? '' }) : null;
  const n = shots.length;
  // the "+N" tile is a computer-only cut (the phone's strip scrolls); null fit = phone or not measured: all shown
  const cut = fit === null ? { shown: n, more: 0 } : thumbsShown(n, set.gallery.thumbsMax, fit);
  const trim = set.gallery.desktopTrimPx;
  const open = (i: number) => (set.gallery.zoom ? setZoomAt(i) : undefined);
  const fromTile = (e: React.SyntheticEvent, i: number) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    open(i);
  };

  return (
    <div
      className={`pdp-gal pdp-galT1${side ? ' vert' : ' pdp-below'}${trim > 0 ? ' trim' : ''}`}
      style={trim > 0 ? ({ '--pdp-gtrim': `${trim}px` } as React.CSSProperties) : undefined}
    >
      <div className="pdp-main" id="pdp-main" ref={mainRef}>
        <div className="pdp-trk" id="pdp-trk" ref={trk} role="group" aria-label={w('photos')} onScroll={onScroll}>
          {shots.map((s, i) => (
            <div
              key={s.id}
              className="pdp-tile"
              data-v={s.draw}
              data-kind={s.kind}
              onClick={(e) => fromTile(e, i)}
              onTouchStart={(e) => {
                if (e.touches.length === 2) fromTile(e, i);
              }}
              onKeyDown={(e) => {
                if (set.gallery.zoom && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  open(i);
                }
              }}
              {...(set.gallery.zoom ? { tabIndex: i === idx ? 0 : -1, role: 'button', 'aria-label': `${altOf(s)} · ${w('zoom.open')}` } : {})}
            >
              <ShotPicture
                shot={s}
                garment={m.garment}
                hex={hex}
                slot="main"
                sizes="(max-width: 1023px) 100vw, 50vw"
                alt={set.gallery.zoom ? '' : altOf(s)}
                lang={lang}
                priority={i === 0}
              />
              {i === 0 && badge && set.gallery.badge ? <span className={`badge-img${badge.sale ? ' sale' : ''}`}>{badge.text}</span> : null}
              {i === 0 && lowText ? (
                <span className="pdp-chip-img low" data-testid="low-chip">
                  <Icon name="clock" size={14} />
                  {lowText}
                </span>
              ) : null}
              {s.kind === 'trueColour' ? (
                <span className="pdp-chip-img glass tr">
                  <Icon name="sun" size={14} />
                  {w('trueChip')}
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {set.gallery.arrows && n > 1 ? (
          <>
            <button
              type="button"
              className={`pdp-arrow l${idx <= 0 ? ' off' : ''}`}
              aria-label={w('prev')}
              aria-disabled={idx <= 0 || undefined}
              tabIndex={idx <= 0 ? -1 : undefined}
              onClick={() => go(stepTo(idx, -1, n))}
            >
              <Icon name="back" size={20} />
            </button>
            <button
              type="button"
              className={`pdp-arrow r${idx >= n - 1 ? ' off' : ''}`}
              aria-label={w('next')}
              aria-disabled={idx >= n - 1 || undefined}
              tabIndex={idx >= n - 1 ? -1 : undefined}
              onClick={() => go(stepTo(idx, 1, n))}
            >
              <Icon name="right" size={20} />
            </button>
          </>
        ) : null}
      </div>
      {set.gallery.thumbs && n > 1 ? (
        <div className={`pdp-thumbs n${n}`} role="group" aria-label={w('photos')} ref={thumbsRef}>
          {shots.map((s, i) => {
            const hid = cut.more > 0 && i >= cut.shown;
            const more = cut.more > 0 && i === cut.shown - 1;
            return (
            <button
              key={s.id}
              type="button"
              className={`pdp-thumb${i === idx ? ' on' : ''}${hid ? ' ob-hid' : ''}${more ? ' ob-more' : ''}`}
              aria-label={more ? `${w(`view.${s.kind}`)} · ${w('morePhotos', { n: num(cut.more) })}` : w(`view.${s.kind}`)}
              aria-pressed={i === idx}
              data-more={more ? w('morePhotosTile', { n: num(cut.more) }) : undefined}
              onClick={() => go(i)}
            >
              <ShotPicture shot={s} garment={m.garment} hex={hex} slot="thumb" sizes="64px" alt="" lang={lang} />
              {s.kind === 'trueColour' ? (
                <span className="pdp-thumb-sun">
                  <Icon name="sun" size={13} />
                </span>
              ) : null}
            </button>
            );
          })}
        </div>
      ) : null}
      {zoomAt !== null ? (
        <PdpZoom
          shots={shots}
          start={zoomAt}
          garment={m.garment}
          hex={hex}
          lang={lang}
          altOf={altOf}
          onClose={(at) => {
            setZoomAt(null);
            go(at, false);
          }}
        />
      ) : null}
    </div>
  );
}
