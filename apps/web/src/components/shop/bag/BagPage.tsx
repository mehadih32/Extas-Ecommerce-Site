// PR 107 — the bag page (demo 50-bag.js renderBag, V12.2): "Your bag — N items" with "Continue shopping", free-delivery
// progress, the lines (items, sets, the two-sizes cards), the one offer slot, saved for later; beside them on a computer
// (under them on a phone) the order summary; under everything "You may also like" with the tier ladder; on a phone the
// checkout bar while the summary's button is out of sight. Server-drawn from the engines; BagActions does the clicks.
// PR 606: the bulk / corporate card under the WhatsApp card, while the owner has the lane on (bulk/BulkBagCard).
// PR 574: each set in its bag template (B1–B5, `combos.template.bag`; the current look by default), `?btpl=` previews
// another with the template bar while `combos.template.preview` is on.
// S02 · PR 77: the left column's parts (free delivery bar, lines, offer, WhatsApp, bulk, saved) come in the owner's order
// and on his screens (`layout.bag`, Website › Page layouts); the lines always show.
// PR 610 (CN-029 Phase 3 qa-gate I3): while checkout is paused (the ERP holds the account) a calm line under the title.
// Follow-up 679 (registry v265): "Send my bag on WhatsApp" under Checkout (`bag.waSendBag`, off) and the set line's own
// switch (`bag.upsell.setLine`, on as before).
import './bag.css';
import { Fragment, type ReactNode } from 'react';
import type { BagView } from '@extas/cart';
import { bagPickCards, cardsByIds } from '@/lib/shop/catalogue';
import { builderGroupHref } from '@/lib/shop/build';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { plural, reassurance } from '@/lib/shop/bag-model';
import type { BagSettings } from '@/lib/shop/bag';
import { waHref } from '@/lib/shop/links';
import { bagWaMessage } from '@/lib/shop/bag-wa';
import { Icon, WaGlyph } from '../Icon';
import { BulkBagCard } from '../bulk/BulkBagCard';
import { BagActions, type BagWords } from './BagActions';
import { EmptyBag, SavedBox } from './BagExtras';
import { ItemLine, SetLine } from './BagLines';
import { BagSetCard } from './BagSetCard';
import { bagSetLooks } from '@/lib/shop/combo-bag';
import { BAG_TEMPLATES } from '@/lib/shop/combo-bag-model';
import { PreviewBar } from '../combo/PreviewBar';
import { FreeBar } from './FreeBar';
import { OfferSlot } from './OfferSlot';
import { SizesCard } from './SizesCard';
import { Upsell } from './Upsell';
import { BagSummary } from './BagSummary';
import { PausedNote } from '../checkout/PausedNote';
import { EtaBanner } from '../EtaBanner';
import { LayoutPart } from '../LayoutPart';
import { shownSections } from '@/lib/shop/layouts';
import type { BagSectionId } from '@extas/settings';

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
    // PR 71 (follow-up 43): "Move to wishlist"
    wished: t('wish.bagMoved'),
    wishFull: t('wish.full'),
  };
}

export async function BagPage({ c, view, s, btpl = null, paused = false, linkCode = null }: { c: ShopContext; view: BagView; s: BagSettings; btpl?: string | null; paused?: boolean; linkCode?: string | null }) {
  const t = c.t;
  const empty = !view.items.length && !view.sets.length;
  const savedOn = s['bag.saved.enabled'];
  const pictureIds = [...view.items, ...view.saved.items].map((i) => i.productId).concat([...view.sets, ...view.saved.sets].flatMap((x) => x.pieces.map((p) => p.productId).filter((id): id is string => !!id)));
  const [cards, picks, looks, builderHref] = await Promise.all([
    cardsByIds(c.storeId, pictureIds),
    !empty && s['bag.upsell.enabled'] ? bagPickCards(c.storeId, view.productIds, s['bag.upsell.count']) : Promise.resolve({ cards: [], from: 'none' as const }),
    bagSetLooks(c.storeId, view.sets, btpl),
    view.tiers && s['bag.upsell.enabled'] ? builderGroupHref(c, view.tiers.ruleKey) : Promise.resolve(null),
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
  const waMessage = s['bag.waSendBag'] ? bagWaMessage(view, { t, money: c.money, num: c.num, lang: c.lang, store: c.storeName }) : null;
  const waSendHref = waMessage ? waHref(c.s['contact.whatsapp'], waMessage) : null;
  const waSend = waMessage && waSendHref ? { href: waSendHref, message: waMessage } : null;
  const left: Record<BagSectionId, () => ReactNode> = {
    free: () => (s['bag.freeProgress.enabled'] ? <FreeBar c={c} free={view.free} /> : null),
    lines: () => (
      <div className="card bg-lines">
        {view.sets.map((x) => {
          const draw = looks.draw.get(x.groupKey) ?? 'current';
          return draw === 'current' ? (
            <SetLine key={x.groupKey} c={c} set={x} cards={cards} />
          ) : (
            <BagSetCard key={x.groupKey} c={c} set={x} cards={cards} draw={draw} nudge={looks.nudges.get(x.groupKey) ?? null} lowStockAt={s['bag.lowStockAt']} />
          );
        })}
        {view.items.map((i) => (
          <Fragment key={i.lineId}>
            <ItemLine c={c} item={i} card={cards.get(i.productId)} blocked={blocked.get(i.lineId)} lowStockAt={s['bag.lowStockAt']} toWish={s['wish.list'].fromBag} />
            {(groupsAfter.get(i.lineId) ?? []).map((g) => (
              <SizesCard key={g.key} c={c} group={g} items={view.items} policyLine={view.policyLine} finderOn={s['pdp.finder'].on} />
            ))}
          </Fragment>
        ))}
      </div>
    ),
    offer: () => <OfferSlot c={c} slot={view.slot} cod={c.flags.cod} upsellShown={upsellShown} />,
    whatsapp: () =>
      wa ? (
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
      ) : null,
    bulk: () => <BulkBagCard c={c} view={view} />,
    saved: () => (savedOn ? <SavedBox c={c} saved={view.saved} cards={cards} keepDays={s['bag.keepDays']} /> : null),
  };
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
        {/* PR 610 (qa-gate I3): checkout is paused now — said before he goes on, and it stays */}
        {paused ? <PausedNote title={t('checkout.paused.title')} text={t('checkout.paused.text')} testId="bag-paused" /> : null}
        {/* PR 193: the Eid order-by date per band (or the pre-order line) and the holiday notice, before he goes on;
            follow-up 655: the festive cut-off words too (Marketing › Festive cut-off, checkout ticked; off: none) */}
        <EtaBanner c={c} testId="bag-eta" festive />
        <div className="split-side">
          <div className="stack s16" style={{ minWidth: 0 }}>
            {/* PR 77: the left column's parts in the owner's order and on his screens (`layout.bag`; the lines always) */}
            {shownSections<BagSectionId>('bag', s['layout.bag']).map(({ id, dev }) => (
              <LayoutPart key={id} id={id} dev={dev}>
                {left[id]()}
              </LayoutPart>
            ))}
            {looks.preview && view.sets.length ? (
              <PreviewBar c={c} kind="bag" list={BAG_TEMPLATES} current={looks.preview} hrefOf={(t) => `${bagHref}?btpl=${t}`} chosen={bagHref} />
            ) : null}
          </div>
          <aside className="sticky-d">
            <BagSummary c={c} view={view} codeOn={s['bag.code.enabled']} trust={trust} blocked={isBlocked} gift={s['checkout.gift'].enabled} waSend={waSend} />
          </aside>
        </div>
      </div>
      {s['bag.upsell.enabled'] ? (
        <Upsell
          c={c}
          cards={picks.cards}
          from={picks.from}
          tiers={view.tiers}
          builderHref={builderHref}
          style={s['bag.upsell.style']}
          phoneLadder={s['bag.tiers.phonePreview']}
          reasons={s['bag.upsell.reasons']}
          setLine={s['bag.upsell.setLine']}
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
      <BagActions words={words} undoMs={s['bag.undoMs']} bagHref={bagHref} stamp={stamp} linkCode={linkCode && (view.code.state === 'none' || view.code.code !== linkCode.toUpperCase()) ? linkCode : null} />
    </div>
  );
}
