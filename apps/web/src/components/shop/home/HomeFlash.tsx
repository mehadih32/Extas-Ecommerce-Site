// PR 44 — "Flash sale" (demo 20-home.js hm_flash; Blueprint §56.1, §57.1, §58.1, §58.11): the title with the "Up to N%
// off" tag and the line under it, the clock on the right (on a phone too), then two rows of the sale's cards on the one
// slider engine (PR 42) — the top row drifting left, the bottom row right, each with its own touch, mouse and keyboard
// pauses. A row binds only when it comes near, after the first paint (SmoothRow). The section hides itself when the
// clock reaches zero (FlashSection). With no sale running nothing is drawn (lib/shop/flash.ts). Settings:
// `home.flashSale` (the owner's sale), `home.flashRows`, `slider.engine`.
import type { ShopContext } from '@/lib/shop/context';
import type { FlashData } from '@/lib/shop/flash';
import { ProductCard } from '../ProductCard';
import { SmoothRow } from '../SmoothRow';
import { FlashClock, FlashSection } from './FlashSale';

export function HomeFlash({ c, sale }: { c: ShopContext; sale: FlashData | null }) {
  if (!sale) return null;
  const sub = c.t('home.flash.sub');
  return (
    <FlashSection endsAt={sale.endsAt} serverNow={sale.serverNow} testId="hm-flash">
      <div className="container">
        <div className="hm-flash-hd">
          <div>
            <div className="row" style={{ gap: 10 }}>
              <h2 className="h2">{c.t('home.flash.title')}</h2>
              {sale.upTo > 0 ? <span className="tag sale">{c.t('home.flash.upTo', { n: c.num(sale.upTo) })}</span> : null}
            </div>
            {sub ? <p className="small muted hm-sub">{sub}</p> : null}
          </div>
          <FlashClock label={c.t('home.flash.endsIn')} aria={c.t('home.flash.clock')} bn={c.lang === 'bn' && c.bnDigits} />
        </div>
        {sale.rows.map((row, i) => (
          <SmoothRow key={i} id={`hm-flash${i + 1}`} className="hm-hrow hm-flashrow" engine={c.s['slider.engine']} dir={i === 0 ? -1 : 1} speed={sale.look.speed} fitCards>
            {row.cards.map((card, k) => (
              <ProductCard key={`${card.id}:${k}`} card={card} c={c} copy={row.copies[k]} />
            ))}
          </SmoothRow>
        ))}
      </div>
    </FlashSection>
  );
}
