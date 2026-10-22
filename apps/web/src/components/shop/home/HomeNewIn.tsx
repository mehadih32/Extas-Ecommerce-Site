// PR 41 — "New in" (demo 20-home.js hm_newIn): the newest published products as cards, two across on a phone and four
// on a desktop. Settings: `home.newIn` (how many, newest first or the owner's order, "View all").
import type { ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ProductCard } from '../ProductCard';
import { SecHd } from './SecHd';

export function HomeNewIn({ c, cards }: { c: ShopContext; cards: ShopCard[] }) {
  if (!cards.length) return null;
  const set = c.s['home.newIn'];
  return (
    <section className="section">
      <div className="container">
        <SecHd title={c.t('home.newIn')} sub={c.t('home.newInSub')} href={hrefIn(c.lang, set.href)} more={c.t('home.viewAll')} />
        <div className="grid g4">
          {cards.map((p) => (
            <ProductCard key={p.id} card={p} c={c} />
          ))}
        </div>
      </div>
    </section>
  );
}
