'use client';
// PR 49 — the product page's one shared state (demo 30-product.js pdp_state): the colour and size the shopper chose, the
// "please choose a size" mark, and the unit of the size chart. Every part of the page that changes with the choice
// (photos, price, sizes, stock, buttons, the bars) reads it from here, so they can never disagree. A colour change
// rewrites the address to that colour's own page (D3.7) without a reload; the server drew the page for the colour in
// the address, so a shared link opens exactly what was shared.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PdpBuySettings, PdpChartSettings, PdpColourSettings, PdpFitSettings, PdpGallerySettings, PdpSizeSettings, PdpStockSettings, PdpSweepSettings } from '@extas/settings';
import { colourHref } from '@/lib/shop/pdp-colour';
import { COLOUR_QUERY } from '@/lib/shop/routes';
import { digitsOf, fillWords, keepSize, type PdpChoice, type PdpModel } from '@/lib/shop/product-model';

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
    }),
    [env, choice, err, unit, words, bnDigits, pickColour, pickSize, needSize],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
