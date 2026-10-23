'use client';
// PR 60 — the stock line above the buttons (Blueprint D3.5, demo 30-product.js pdp_stockLine): "In stock", "In stock —
// ships today if you order before 5 pm" only with the owner's dispatch time and only before it, "Only 2 left in Navy,
// size L" from the owner's number down, "Out of stock in Navy" for a crossed-out size, "Sold out in Navy — try another
// colour". Read out when it changes.
import { Icon } from '../Icon';
import { stockLine } from '@/lib/shop/pdp-stock';
import { usePdp } from './PdpRoot';
import { sweepClass } from '@/lib/shop/sweep-class';

export function PdpStock({ cutoffWords }: { cutoffWords: string | null }) {
  const { m, set, choice, w, num, shipsToday } = usePdp();
  if (!set.stock.line) return null;
  const say = stockLine(m, choice, set.stock, shipsToday && !!cutoffWords);
  const colour = m.colours.find((c) => c.key === choice.colour)?.name ?? '';
  const size = m.sizes.find((s) => s.key === choice.size)?.label ?? '';
  const text = w(`stock.${say.kind}`, { n: num(say.n), colour, size, time: cutoffWords ?? '' });
  const icon = say.kind === 'low' || say.kind === 'lowSize' ? 'clock' : say.warn ? 'info' : 'truck';
  return (
    <div className="pdp-sec pdp-stocksec">
      <div className={`pdp-stock${say.warn ? ' low' : ''}${sweepClass(!say.warn && set.sweep.stock)}`} data-testid="stock-line" data-kind={say.kind} role="status">
        <Icon name={icon} size={15} />
        <span>{text}</span>
      </div>
    </div>
  );
}
