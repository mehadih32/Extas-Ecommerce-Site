// PR 107 — the bag page (demo 50-bag.js renderBag, V12.2): "Your bag — N items" with "Continue shopping", free-delivery
// progress, the lines (items, sets, the two-sizes cards), the one offer slot, saved for later; beside them on a computer
// (under them on a phone) the order summary; under everything "You may also like" with the tier ladder; on a phone the
// checkout bar while the summary's button is out of sight. Server-drawn from the engines; BagActions does the clicks.
import './bag.css';
import { Fragment } from 'react';
import type { BagView } from '@extas/cart';
import { bagPickCards, cardsByIds } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { plural, reassurance } from '@/lib/shop/bag-model';
import type { BagSettings } from '@/lib/shop/bag';
import { waHref } from '@/lib/shop/links';
import { Icon, WaGlyph } from '../Icon';
import { BagActions, type BagWords } from './BagActions';
import { EmptyBag, SavedBox } from './BagExtras';
import { ItemLine, SetLine } from './BagLines';
import { FreeBar } from './FreeBar';
import { OfferSlot } from './OfferSlot';
import { SizesCard } from './SizesCard';
import { Upsell } from './Upsell';
import { BagSummary } from './BagSummary';

export function bagWords(c: ShopContext): BagWords {
  const t = c.t;
  return {
    undo: t('bag.toast.undo'),
    removed: t('bag.toast.removed'),
    setRemoved: t('bag.toast.setRemoved'),
    saved: t('bag.toast.saved'),
    moved: t('bag.toast.moved'),
    restored: t('bag.toast.restored'),
    kept: t('bag.toast.kept'),
    changed: t('bag.toast.changed'),
    error: t('bag.toast.error'),
    stock: t('bag.toast.stock'),
    tooMany: t('bag.toast.tooMany'),
    notForSale: t('bag.toast.notForSale'),
    codeEmpty: t('bag.code.empty'),
    codeRemoved: t('bag.code.removed'),
  };
}

export async function BagPage({ c, view, s }: { c: ShopContext; view: BagView; s: BagSettings }) {
  const t = c.t;
  const empty = !view.items.length && !view.sets.length;
  const savedOn = s['bag.saved.enabled'];
  const pictureIds = [...view.items, ...view.saved.items].map((i) => i.productId).concat([...view.sets, ...view.saved.sets].flatMap((x) => x.pieces.map((p) => p.productId).filter((id): id is string => !!id)));
  const [cards, picks] = await Promise.all([
    cardsByIds(c.storeId, pictureIds),
    !empty && s['bag.upsell.enabled'] ? bagPickCards(c.storeId, view.productIds, s['bag.upsell.count']) : Promise.resolve({ cards: [], from: 'none' as const }),
  ]);
  const trust = reassurance(c.flags, { securePayment: s['bag.trust.securePayment'], originalLine: s['bag.upsell.originalLine'] });
  const words = bagWords(c);
  const bagHref = hrefIn(c.lang, ROUTES.bag);
  const stamp = `${view.summary.count}:${view.summary.totalMinor}:${view.blocked.length}`;
  if (empty) {
    return (
      <div className="bg-page" data-bag-root="" data-testid="bag-page" data-empty="1">
        <div className="container bg-wrap">
          <EmptyBag c={c} cats={c.cats} />
          {savedOn ? <SavedBox c={c} saved={view.saved} cards={cards} keepDays={s['bag.keepDays']} /> : null}
        </div>
        <BagActions words={words} undoMs={s['bag.undoMs']} bagHref={bagHref} stamp={stamp} />
      </div>
    );
  }
  const blocked = new Map(view.blocked.map((b) => [b.lineId, b]));
  const groupsAfter = new Map<string, BagView['groups']>();
  for (const g of view.groups) groupsAfter.set(g.lastLineId, [...(groupsAfter.get(g.lastLineId) ?? []), g]);
  const upsellShown = picks.cards.length > 0 || view.tiers !== null;
  const wa = s['bag.whatsappHelp'] ? waHref(c.s['contact.whatsapp'], t('bag.wa.message', c.vars)) : null;
  const isBlocked = view.blocked.length > 0;
  return (
    <div className="bg-page" data-bag-root="" data-testid="bag-page">
      <div className="container bg-wrap">
        <div className="bg-title">
          <h1 className="h1">
            {t('bag.title')}
            <span className="cnt">
              <bdi className="hide-m bg-cdash">— </bdi>
              {plural(t, 'bag.count', view.summary.count, c.num)}
            </span>
          </h1>
          <a className="link hide-m bg-cont" href={hrefIn(c.lang, ROUTES.newIn)}>
            {t('bag.continue')}
          </a>
        </div>
        <div className="split-side">
          <div className="stack s16" style={{ minWidth: 0 }}>
            {s['bag.freeProgress.enabled'] ? <FreeBar c={c} free={view.free} /> : null}
            <div className="card bg-lines">
              {view.sets.map((x) => (
                <SetLine key={x.groupKey} c={c} set={x} cards={cards} />
              ))}
              {view.items.map((i) => (
                <Fragment key={i.lineId}>
                  <ItemLine c={c} item={i} card={cards.get(i.productId)} blocked={blocked.get(i.lineId)} lowStockAt={s['bag.lowStockAt']} />
                  {(groupsAfter.get(i.lineId) ?? []).map((g) => (
                    <SizesCard key={g.key} c={c} group={g} items={view.items} policyLine={view.policyLine} />
                  ))}
                </Fragment>
              ))}
            </div>
            <OfferSlot c={c} slot={view.slot} cod={c.flags.cod} upsellShown={upsellShown} />
            {wa ? (
              <div className="card p16 row" style={{ gap: 12 }} data-testid="bag-wa">
                <span className="bg-ic">
                  <WaGlyph size={20} />
                </span>
                <div className="grow">
                  <div className="h3">{t('bag.wa.title')}</div>
                  <div className="small text2">{t('bag.wa.text')}</div>
                </div>
                <a className="btn btn-secondary btn-sm" href={wa} target="_blank" rel="noopener">
                  {t('bag.wa.button')}
                </a>
              </div>
            ) : null}
            {savedOn ? <SavedBox c={c} saved={view.saved} cards={cards} keepDays={s['bag.keepDays']} /> : null}
          </div>
          <aside className="sticky-d">
            <BagSummary c={c} view={view} codeOn={s['bag.code.enabled']} trust={trust} blocked={isBlocked} />
          </aside>
        </div>
      </div>
      {s['bag.upsell.enabled'] ? (
        <Upsell
          c={c}
          cards={picks.cards}
          from={picks.from}
          tiers={view.tiers}
          style={s['bag.upsell.style']}
          phoneLadder={s['bag.tiers.phonePreview']}
          reasons={s['bag.upsell.reasons']}
          trust={trust}
        />
      ) : null}
      <div className="mbar dm-hide bg-mbar bg-mbar-off">
        {isBlocked ? (
          <button type="button" className="btn btn-primary btn-block" disabled data-testid="bag-mbar">
            {t('bag.summary.fix')}
          </button>
        ) : (
          <a className="btn btn-primary btn-block" href={hrefIn(c.lang, ROUTES.checkout)} data-testid="bag-mbar">
            {t('bag.mbar', { amount: c.money(view.summary.totalMinor) })}
            <Icon name="right" size={18} />
          </a>
        )}
      </div>
      <BagActions words={words} undoMs={s['bag.undoMs']} bagHref={bagHref} stamp={stamp} />
    </div>
  );
}
