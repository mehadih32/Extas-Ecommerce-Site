'use client';
// PR 43 — the hero's sliding pictures (demo 20-home.js hm_heroSlider, 97-desk-a.js deskHeroKeys): a row on the one
// slider engine with the two arrows beside it. One tap moves one picture (`stepMs`, eased); the mouse on an arrow
// rests the row as the mouse on the row does, keyboard focus anywhere in the box is the keyboard pause, and a finger's
// tap starts the touch hold — each with its own resume (L32/L33). The pins fit their words (HERO_PIN_FIT, run here
// before the copies are made, so each copy is born fitted; ShellEffects' refit gives each copy its card's result). The
// pictures themselves are drawn on the server and handed in as children.
import type { SliderEngine } from '@extas/settings';
import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { HERO_PIN_FIT, fitAll } from '@/lib/shop/fit';
import { series } from '@/lib/shop/later';
import { bindRowControls, bindSmoothRow, stepRow, type Hand } from '@/lib/shop/slider';
import { Icon } from '../Icon';

const DESK = '(min-width:1024px)';

export function HeroSlider({
  engine,
  speed,
  stepMs,
  prevLabel,
  nextLabel,
  phoneArrows,
  children,
}: {
  engine: SliderEngine;
  speed: number;
  stepMs: number;
  prevLabel: string;
  nextLabel: string;
  phoneArrows: boolean;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const hand = useRef<Hand>('mouse');
  const glide = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    const b = box.current;
    const el = track.current;
    if (!b || !el) return;
    const undo: Array<() => void> = [];
    // after the first paint, a part per task (the TBT budget): the pins first, so each copy is born fitted, then the
    // row with its copies, then the arrows and the Tab order. ~~all three in one frame~~
    const stop = series([
      () => fitAll(b, [HERO_PIN_FIT]),
      () => undo.push(bindSmoothRow(el, engine, { dir: -1, speed })),
      () => undo.push(bindRowControls(b, el, DESK)),
    ]);
    return () => {
      stop();
      glide.current?.();
      undo.forEach((f) => f());
    };
  }, [engine, speed]);

  const step = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    glide.current?.();
    glide.current = stepRow(el, dir, stepMs, hand.current);
    hand.current = 'mouse'; // a key press after a tap is the keyboard's (its own pause)
  };
  const press = (ev: PointerEvent) => {
    hand.current = (ev.pointerType as Hand) || 'mouse';
  };

  return (
    <div ref={box} className="hm-slider" data-hero-slider="" data-arrows={phoneArrows ? '1' : undefined}>
      <div ref={track} className="hm-sltrack" id="hm-sltrack" data-smooth="1">
        {children}
      </div>
      <button type="button" className="hm-slnav prev" aria-label={prevLabel} onPointerDown={press} onClick={() => step(-1)}>
        <Icon name="back" size={18} />
      </button>
      <button type="button" className="hm-slnav next" aria-label={nextLabel} onPointerDown={press} onClick={() => step(1)}>
        <Icon name="right" size={18} />
      </button>
    </div>
  );
}
