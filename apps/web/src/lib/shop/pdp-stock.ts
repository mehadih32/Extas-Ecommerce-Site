// PR 60 — the stock line above the buttons (Blueprint D3.5, demo 30-product.js pdp_stockLine / pdp_lowText): what the
// shop can honestly say about the piece the shopper is looking at. "Only N left" from the owner's number down
// (`pdp.stock.lowAt`), "ships today if you order before …" only with the owner's dispatch time and only before it
// (`pdp.stock.dispatchCutoff`), and a plain "In stock" otherwise. A page of a product taken off sale says so. Pure.
import type { PdpStockSettings } from '@extas/settings';
import { isOneSize, stockOf, type PdpChoice, type PdpModel } from './product-model';

export type StockKind = 'in' | 'ships' | 'low' | 'lowSize' | 'out' | 'soldOut' | 'gone' | 'off';

export interface StockSay {
  kind: StockKind;
  /** Pieces, for "Only N left". */
  n: number;
  /** A warning (amber) rather than good news. */
  warn: boolean;
}

/** The store's clock now, `HH:MM` (24-hour), in its own time zone. */
export function clockIn(timeZone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const v = (k: string) => parts.find((p) => p.type === k)?.value ?? '00';
    return `${v('hour')}:${v('minute')}`;
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

/** The dispatch time as the page says it: "5:00 pm" in English, the 24-hour clock in Bengali. */
export function cutoffWords(hhmm: string, lang: 'en' | 'bn'): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  if (lang === 'bn') return hhmm;
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? 'am' : 'pm'; // hardcode-ok: the English clock's own marks, not words a shop owner changes
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
}

/** Whether "ships today" still holds: the store's time now (HH:MM) is before the owner's dispatch time. */
export function beforeCutoff(nowHHMM: string, cutoff: string | null): boolean {
  return !!cutoff && /^\d{2}:\d{2}$/.test(nowHHMM) && nowHHMM < cutoff;
}

/** The short urgent line ("Only 2 left in Navy, size L"), shared by the photo chip and the stock line, or null. */
export function lowStock(m: Pick<PdpModel, 'variants' | 'sizes'>, choice: PdpChoice, lowAt: number): StockSay | null {
  if (lowAt <= 0) return null;
  const sized = !!choice.size && !isOneSize(m);
  const n = sized ? stockOf(m, choice.colour, choice.size) : stockOf(m, choice.colour);
  return n > 0 && n <= lowAt ? { kind: sized ? 'lowSize' : 'low', n, warn: true } : null;
}

/** What the stock line says for a choice. */
export function stockLine(
  m: Pick<PdpModel, 'variants' | 'sizes' | 'onSale'>,
  choice: PdpChoice,
  set: Pick<PdpStockSettings, 'lowAt' | 'dispatchCutoff'>,
  shipsToday: boolean,
): StockSay {
  if (!m.onSale) return { kind: 'off', n: 0, warn: true };
  if (!m.variants.some((v) => v.stock > 0)) return { kind: 'gone', n: 0, warn: true };
  const sized = !!choice.size && !isOneSize(m);
  if (sized && stockOf(m, choice.colour, choice.size) <= 0) return { kind: 'out', n: 0, warn: true };
  if (stockOf(m, choice.colour) <= 0) return { kind: 'soldOut', n: 0, warn: true };
  const low = lowStock(m, choice, set.lowAt);
  if (low) return low;
  return { kind: shipsToday && set.dispatchCutoff ? 'ships' : 'in', n: 0, warn: false };
}
