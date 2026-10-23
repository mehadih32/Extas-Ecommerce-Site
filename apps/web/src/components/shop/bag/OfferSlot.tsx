// PR 109 — the one offer slot under the lines (a set that saves, the free-delivery gap, or "already free"; never between
// products, never an empty box) and the tier box "Take 2 │ 3 │ 4" from the Build-your-own-set rules: the full ladder on
// a computer, a one-line preview on the phone (the full ladder there only when `bag.tiers.phonePreview` is off).
import type { BagView } from '@extas/cart';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { inSentence } from '@/lib/shop/bag-model';
import { Icon } from '../Icon';
import { nameOf } from './BagLines';

/** PR 109 — the one slot under the lines. */
export function OfferSlot({ c, slot, cod, upsellShown }: { c: ShopContext; slot: BagView['slot']; cod: boolean; upsellShown: boolean }) {
  const t = c.t;
  if (!slot) return null;
  let title: string;
  let text: string | null = null;
  let go: { href: string; label: string };
  let icon: 'gift' | 'truck' = 'truck';
  if (slot.kind === 'set') {
    const names = (c.lang === 'bn' ? slot.namesBn : slot.names).join(' + ');
    title = t('bag.slot.setTitle', { n: c.num(slot.pieces), saving: c.money(slot.savingMinor) });
    text = t('bag.slot.setText', { names, price: c.money(slot.payMinor), n: c.num(slot.pieces) });
    go = { href: hrefIn(c.lang, ROUTES.combo(slot.slug)), label: t('bag.slot.setGo') };
    icon = 'gift';
  } else if (slot.kind === 'freeGap') {
    title = t('bag.slot.gapTitle', { amount: c.money(slot.remainingMinor) });
    text = cod ? t('bag.slot.gapCod') : null;
    go = { href: upsellShown ? '#bg-ups' : hrefIn(c.lang, ROUTES.newIn), label: t('bag.slot.gapGo') };
  } else {
    title = t('bag.slot.doneTitle');
    go = { href: hrefIn(c.lang, ROUTES.checkout), label: t('bag.slot.doneGo') };
  }
  return (
    <div className="bg-offer-slot bg-offer tint" data-testid="bag-offer-slot" data-kind={slot.kind}>
      <span className="bg-ic">
        <Icon name={icon} size={18} />
      </span>
      <div className="grow">
        <div className="h3">{title}</div>
        {text ? <div className="small text2">{text}</div> : null}
      </div>
      <a className="btn btn-secondary btn-sm shrink0" href={go.href}>
        {go.label}
      </a>
    </div>
  );
}

/** PR 109 — "Buy more polos, pay less": the tier rule's ladder (computer; on the phone only when switched on). */
export function Ladder({ c, tiers, phone }: { c: ShopContext; tiers: NonNullable<BagView['tiers']>; phone: boolean }) {
  const t = c.t;
  const catName = tiers.category ? inSentence(nameOf(tiers.category, c), c.lang) : t('bag.tiers.items');
  const go = tiers.category ? hrefIn(c.lang, ROUTES.category(tiers.category.slug)) : null;
  const next = tiers.ladder.next;
  return (
    <div className={`bgc-ladder${phone ? '' : ' hide-m'}`} data-testid="bag-tiers" data-rule={tiers.ruleKey}>
      <div className="bgc-th1">{t('bag.tiers.title', { cat: catName })}</div>
      {tiers.ladder.rows.map((r) => (
        <div key={r.quantity} className="bgc-lr">
          <b>{t('bag.tiers.row', { n: c.num(r.quantity), cat: catName })}</b>
          <span className="price">{c.money(r.priceMinor)}</span>
          {r.saveMinor ? <span className="bgc-ts">{t('bag.tiers.save', { amount: c.money(r.saveMinor) })}</span> : null}
        </div>
      ))}
      <div className="bgc-lprog">
        <span className="bgc-lpb">
          <i style={{ width: `${tiers.ladder.progress}%` }} />
        </span>
        <span className="small">
          {t('bag.tiers.inBag', { n: c.num(tiers.inBag) })} · <b>{next ? t('bag.tiers.next', { more: c.num(next.more), q: c.num(next.quantity), price: c.money(next.priceMinor) }) : t('bag.tiers.top')}</b>
        </span>
      </div>
      <p className="bgc-ltip">
        <Icon name="swap" size={14} />
        <span>{t('bag.tiers.tip')}</span>
      </p>
      {go ? (
        <a className="btn btn-secondary btn-block bgc-lgo" href={go}>
          {t('bag.tiers.go', { cat: catName })}
          <Icon name="right" size={16} />
        </a>
      ) : null}
    </div>
  );
}

/** The phone's one-line tier preview ("Buy 2 and save · 2 for ৳ 1,500 · you save ৳ 200"). */
export function PhoneTier({ c, tiers }: { c: ShopContext; tiers: NonNullable<BagView['tiers']> }) {
  const row = tiers.ladder.rows.find((r) => r.quantity === tiers.ladder.next?.quantity) ?? tiers.ladder.rows.find((r) => r.saveMinor);
  if (!row || !row.saveMinor || !tiers.category) return null;
  return (
    <a className="ups-set hide-d" href={hrefIn(c.lang, ROUTES.category(tiers.category.slug))} data-testid="bag-tiers-phone">
      <span className="ic">
        <Icon name="layers" size={18} />
      </span>
      <span className="grow">
        <b>{c.t('bag.tiers.phoneTitle', { q: c.num(row.quantity) })}</b>
        <span>{c.t('bag.tiers.phoneText', { q: c.num(row.quantity), price: c.money(row.priceMinor), saving: c.money(row.saveMinor) })}</span>
      </span>
      <Icon name="right" size={18} />
    </a>
  );
}
