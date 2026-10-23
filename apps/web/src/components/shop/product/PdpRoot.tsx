'use client';
// PR 49 — the product page's one shared state (demo 30-product.js pdp_state): the colour and size the shopper chose, the
// "please choose a size" mark, and the unit of the size chart. Every part of the page that changes with the choice
// (photos, price, sizes, stock, buttons, the bars) reads it from here, so they can never disagree. A colour change
// rewrites the address to that colour's own page (D3.7) without a reload; the server drew the page for the colour in
// the address, so a shared link opens exactly what was shared.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PdpBuySettings, PdpChartSettings, PdpColourSettings, PdpFitSettings, PdpGallerySettings, PdpSizeSettings, PdpStockSettings, PdpSweepSettings } from '@extas/settings';
import { colourHref } from '@/lib/shop/pdp-colour';
import { COLOUR_QUERY } from '@/lib/shop/routes';
import { digitsOf, fillWords, keepSize, stockOf, type PdpChoice, type PdpModel } from '@/lib/shop/product-model';
import { keepUsual, loadUsual, readUsual, saveUsual, type SizeGroup } from '@/lib/shop/usual-size';
import { afterPaint } from '@/lib/shop/later';
import { BAG_ADDED_EVENT } from '../bag/AddToBag';

/** The settings the client parts read (the rest are used on the server only). */
export interface PdpClientSettings {
  gallery: PdpGallerySettings;
  colour: PdpColourSettings;
  size: PdpSizeSettings;
  chart: PdpChartSettings;
  stock: Pick<PdpStockSettings, 'line' | 'lowAt' | 'lowChip' | 'dispatchCutoff'>;
  buy: PdpBuySettings;
  sweep: PdpSweepSettings;
  fit: PdpFitSettings;
  colourPaths: boolean;
  /** Follow-up 62 · the owner's word under each size box on this page, by size key (empty: none). */
  sizeWords: Record<string, string>;
  /** Follow-up 62 · "Your size" (`pdp.usualSize`), with the product's group; null = off. */
  usual: { preselect: boolean; days: number; group: SizeGroup } | null;
}

export interface PdpEnv {
  lang: 'en' | 'bn';
  m: PdpModel;
  set: PdpClientSettings;
  /** The page's words (shop dictionary `pdp.*`, with the owner's own), {slots} still open. */
  words: Record<string, string>;
  bnDigits: boolean;
  /** The product's own address in the page's language (`/bn/p/<slug>`). */
  productHref: string;
  /** "ships today" still holds right now (the owner's dispatch time, in the store's time zone). */
  shipsToday: boolean;
  /** The size chart's "Ask on WhatsApp" link (null: no number, or switched off). */
  chartWa: string | null;
  /** The chart is a bottom garment's (the trousers tip under "How to measure"). */
  chartBottom: boolean;
}

interface Pdp extends PdpEnv {
  choice: PdpChoice;
  /** "Please choose a size" is showing. */
  err: boolean;
  unit: 'inch' | 'cm';
  w: (key: string, vars?: Record<string, string | number>) => string;
  num: (n: number | string) => string;
  pickColour: (key: string) => void;
  pickSize: (key: string) => void;
  /** Add to Bag / Order Now with no size: mark the sizes and bring them into view (demo pdp_needSize, A8). */
  needSize: () => void;
  setUnit: (u: 'inch' | 'cm') => void;
  /** Follow-up 62 · the size this browser last put in the bag for this kind of garment (null: none, or off). */
  usualSize: string | null;
}

const Ctx = createContext<Pdp | null>(null);

export function usePdp(): Pdp {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePdp outside the product page');
  return v;
}

export function PdpRoot({ env, initial, children }: { env: PdpEnv; initial: PdpChoice; children: ReactNode }) {
  const [choice, setChoice] = useState<PdpChoice>(initial);
  const [err, setErr] = useState(false);
  const [unit, setUnit] = useState<'inch' | 'cm'>(env.set.chart.unit);
  const { m, words, bnDigits, productHref, set } = env;
  const [usualSize, setUsualSize] = useState<string | null>(null);

  // follow-up 62 · read after the first paint (never on the server: it lives in this browser), chosen when asked
  const usual = set.usual;
  useEffect(() => {
    if (!usual) return;
    const sizes = m.sizes.map((x) => x.key);
    const stop = afterPaint(() => {
      const size = readUsual(loadUsual(), usual.group, usual.days, Date.now(), sizes);
      setUsualSize(size);
      if (size && usual.preselect && sizes.length > 1) setChoice((c) => (c.size === null && stockOf(m, c.colour, size) > 0 ? { ...c, size } : c));
    });
    const onAdded = (e: Event) => {
      const id = (e as CustomEvent<{ variantId?: string }>).detail?.variantId;
      const v = m.variants.find((x) => x.id === id);
      if (!v?.size || m.sizes.length < 2) return;
      saveUsual(keepUsual(loadUsual(), usual.group, v.size, Date.now()));
      setUsualSize(v.size);
    };
    window.addEventListener(BAG_ADDED_EVENT, onAdded);
    return () => {
      stop();
      window.removeEventListener(BAG_ADDED_EVENT, onAdded);
    };
  }, [m, usual]);

  const pickColour = useCallback(
    (key: string) => {
      setChoice((c) => ({ colour: key, size: keepSize(m, key, c.size) }));
      try {
        const q = new URLSearchParams(window.location.search);
        q.delete(COLOUR_QUERY);
        const base = colourHref(productHref, key, { colourPaths: set.colourPaths });
        const rest = q.toString();
        window.history.replaceState(window.history.state, '', rest ? `${base}${base.includes('?') ? '&' : '?'}${rest}` : base);
      } catch {
        /* the address stays; the page still shows the colour */
      }
    },
    [m, productHref, set.colourPaths],
  );
  const pickSize = useCallback((key: string) => {
    setChoice((c) => ({ ...c, size: key }));
    setErr(false);
  }, []);
  const needSize = useCallback(() => {
    setErr(true);
    requestAnimationFrame(() => document.getElementById('pdp-sizes')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }, []);

  const value = useMemo<Pdp>(
    () => ({
      ...env,
      choice,
      err,
      unit,
      w: (key, vars = {}) => fillWords(words[key] ?? key, vars),
      num: (n) => digitsOf(n, bnDigits),
      pickColour,
      pickSize,
      needSize,
      setUnit,
      usualSize,
    }),
    [env, choice, err, unit, words, bnDigits, pickColour, pickSize, needSize, usualSize],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
