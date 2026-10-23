// PR 106 — the bag's test page, on test servers only (EXTAS_SHOP_TEST_PAGES=1; the live shop answers "page not found"):
// sample items with the shop's real Add button, and the added-to-bag panel exactly as the product page (PR 49) will
// mount it — the button opens `?added=<line>`, and this page draws <AddedPanel> for that line.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { productFacts, type ProductFact } from '@extas/combos';
import { AddedPanel } from '@/components/shop/bag/AddedPanel';
import { AddToBag } from '@/components/shop/bag/AddToBag';
import { TryFill } from '@/components/shop/bag/TryFill';
import '@/components/shop/bag/bag.css';
import { testPagesOn } from '@/lib/shop/bag-api';
import { bagSettings, cartDeps, currentBag } from '@/lib/shop/bag';
import { reassurance } from '@/lib/shop/bag-model';
import { bagPickCards, cardsByIds, colourName, productName } from '@/lib/shop/catalogue';
import { shopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TryBag({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!testPagesOn()) notFound();
  const c = await shopContext();
  const t = c.t;
  const deps = cartDeps();
  const added = (await searchParams).added;
  const s = await bagSettings(c.storeId);
  const rows = deps ? await deps.db.product.findMany({ where: { storeId: c.storeId, status: 'PUBLISHED', archivedAt: null }, orderBy: [{ sortRank: 'desc' }, { nameEn: 'asc' }], select: { id: true }, take: 8 }) : [];
  const ids = rows.map((r) => r.id);
  const facts = deps && ids.length ? await productFacts(deps, c.storeId, ids) : new Map<string, ProductFact>();
  const view = typeof added === 'string' ? await currentBag(c) : null;
  const [cards, picks] = view
    ? await Promise.all([cardsByIds(c.storeId, view.items.map((i) => i.productId)), bagPickCards(c.storeId, view.productIds, s['bag.panel.picks'])])
    : [new Map(), { cards: [] }];
  const words = {
    label: t('bag.panel.add'),
    added: t('bag.toast.added'),
    already: t('bag.toast.already'),
    error: t('bag.toast.error'),
    stock: t('bag.toast.stock'),
    tooMany: t('bag.toast.tooMany'),
    notForSale: t('bag.toast.notForSale'),
  };
  const bagHref = hrefIn(c.lang, ROUTES.bag);
  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 40 }} data-testid="bag-try">
      <h1 className="h1">{t('bag.try.title')}</h1>
      <p className="text2">{t('bag.try.text')}</p>
      <TryFill label={t('bag.try.fill')} bagHref={bagHref} error={t('bag.toast.error')} />
      <div className="stack s16 mt24">
        {[...facts.values()].map((p) => {
          const colour = p.colours[0];
          const open = p.variants.filter((v) => v.colourId === (colour?.id ?? null) && v.sellable > 0 && v.priceMinor !== null);
          return (
            <div key={p.id} className="card p16">
              <div className="h3">{productName(p, c.lang)}</div>
              <div className="small text2">{colour ? colourName(colour, c.lang) : null}</div>
              <div className="row wrap mt12" style={{ gap: 8 }}>
                {open.slice(0, 5).map((v) => (
                  <span key={v.id} className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <span className="small bold">{p.sizes.find((x) => x.id === v.sizeId)?.label ?? ''}</span>
                    <AddToBag variantId={v.id} behaviour={s['bag.addBehaviour']} bagHref={bagHref} words={words} source="try" className="btn btn-secondary btn-sm" />
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {view && typeof added === 'string' ? (
        <AddedPanel
          c={c}
          view={view}
          lineId={added}
          s={s}
          cards={cards}
          picks={picks.cards}
          trust={reassurance(c.flags, { securePayment: s['bag.trust.securePayment'], originalLine: s['bag.upsell.originalLine'] })}
          closeHref={hrefIn(c.lang, `${ROUTES.bag}/try`)}
        />
      ) : null}
    </div>
  );
}
