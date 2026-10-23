// PR 107 — the bag page's saved-for-later strip ("Move to bag") and the empty bag (where to go next, the shop's
// categories). The other parts around the lines live in FreeBar (113), OfferSlot (109) and Upsell (114).
import type { BagSetView, BagItem } from '@extas/cart';
import { colourName, type ShopCard } from '@/lib/shop/catalogue';
import type { ShopCategory } from '@/lib/shop/shell-model';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { plural } from '@/lib/shop/bag-model';
import { Icon } from '../Icon';
import { nameOf, Thumb } from './BagLines';

function SavedRow({ c, name, sub, priceMinor, lineId, card, colourKey, hex, testId }: { c: ShopContext; name: string; sub: string; priceMinor: number; lineId: string; card: ShopCard | undefined; colourKey: string | undefined; hex: string; testId: string }) {
  return (
    <div className="zc-saved" data-testid={testId}>
      <div className="zc-savedimg">
        <Thumb c={c} card={card} colourKey={colourKey} hex={hex} alt={name} />
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small bold zc-savednm">{name}</div>
        {sub ? <div className="xs text2">{sub}</div> : null}
        <div className="small price" style={{ marginTop: 2 }}>
          {c.money(priceMinor)}
        </div>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" data-bag-act="move" data-id={lineId} aria-label={c.t('bag.saved.moveName', { name })}>
        <Icon name="bag" size={16} />
        {c.t('bag.saved.move')}
      </button>
    </div>
  );
}

/** PR 107 — "Saved for later": in this bag (this browser), each with "Move to bag". */
export function SavedBox({ c, saved, cards, keepDays }: { c: ShopContext; saved: { items: BagItem[]; sets: BagSetView[] }; cards: Map<string, ShopCard>; keepDays: number }) {
  const n = saved.items.length + saved.sets.length;
  if (!n) return null;
  return (
    <section className="card zc-savedbox" data-testid="bag-saved">
      <div className="row between">
        <h2 className="h3">
          <Icon name="heart" size={16} /> {c.t('bag.saved.title', { n: c.num(n) })}
        </h2>
      </div>
      <div className="zc-savedlist">
        {saved.items.map((i) => (
          <SavedRow
            key={i.lineId}
            c={c}
            name={nameOf(i, c)}
            sub={[i.colour ? colourName(i.colour, c.lang) : null, i.size?.label].filter(Boolean).join(' · ')}
            priceMinor={i.unitPriceMinor * i.quantity}
            lineId={i.lineId}
            card={cards.get(i.productId)}
            colourKey={i.colour?.key}
            hex={i.colour?.hex ?? ''}
            testId="bag-saved-item"
          />
        ))}
        {saved.sets.map((s) => (
          <SavedRow
            key={s.lineId}
            c={c}
            name={nameOf(s, c)}
            sub={plural(c.t, 'bag.set.pieces', s.pieces.length, c.num)}
            priceMinor={s.payMinor}
            lineId={s.lineId}
            card={s.pieces[0]?.productId ? cards.get(s.pieces[0].productId) : undefined}
            colourKey={s.pieces[0]?.colour?.key}
            hex={s.pieces[0]?.colour?.hex ?? ''}
            testId="bag-saved-set"
          />
        ))}
      </div>
      <p className="xs muted mt8" style={{ margin: '8px 0 0' }}>
        {c.t('bag.saved.note', { days: c.num(keepDays) })}
      </p>
    </section>
  );
}

/** The empty bag (demo bag-empty): where to go next, and the shop's categories. */
export function EmptyBag({ c, cats }: { c: ShopContext; cats: ShopCategory[] }) {
  const t = c.t;
  return (
    <div className="card bg-empty center" data-testid="bag-empty">
      <div className="bg-emptyic">
        <Icon name="bag" size={32} />
      </div>
      <h1 className="h1 mt16">{t('bag.empty.title')}</h1>
      <p className="text2">{c.flags.cod ? t('bag.empty.textCod') : t('bag.empty.text')}</p>
      <div className="row wrap mt16" style={{ justifyContent: 'center', gap: 10 }}>
        <a className="btn btn-primary" href={hrefIn(c.lang, ROUTES.newIn)}>
          {t('bag.empty.shop')}
        </a>
        <a className="btn btn-ghost" href={hrefIn(c.lang, ROUTES.combos)}>
          {t('bag.empty.sets')}
        </a>
      </div>
      {cats.length ? (
        <div className="row wrap mt24" style={{ justifyContent: 'center', gap: 8 }}>
          {cats.map((x) => (
            <a key={x.slug} className="chip" href={hrefIn(c.lang, ROUTES.category(x.slug))}>
              {nameOf(x, c)}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
