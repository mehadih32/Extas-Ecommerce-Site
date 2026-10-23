// PR 49 — the product page, template T1 (Blueprint D3.5–D3.8, demo 30-product.js PAGES.product): on a phone the photo,
// then the buy column (title and heart, price row, colours, sizes, stock line, the buttons, the promise row), then
// Delivery · Exchange · Returns and the details, with the buy bar held at the bottom of the screen; on a computer the
// photos on the left, the buy column on the right (sticky), the details under it, and the slim bar once the buttons
// have scrolled away. PR 50: template T2 (Editorial) stacks the photos (PdpGallery) beside a narrower buy column, on the
// plain surface with the editorial title, each on its own switch (`pdp.templates.t2`). PR 58: "Find my size" under the
// sizes and its popup, only where the product's own chart can answer (`pdp.finder`); a phone that answered before opens
// with its size chosen and tagged. PR 51: template T3 (Fit-first) puts the sizes, the finder and the measurements in
// one card (PdpT3Card, `pdp.templates.t3`). PR 66: "Questions & answers" under the details, the shop's own answers
// only, with the WhatsApp ask (PdpQa, `pdp.qa`). A product taken off sale keeps its page,
// everything shown sold out (PR 36). The parts that change with the shopper's choice are small client parts sharing
// one state (PdpRoot); the rest is drawn here. PR 102: the sets this product is in, one line each above the buttons
// ("Polo Duo: any 2 colours for ৳1,800 · Save ৳200", `combos.pdpOffer`), each linking to its combo page.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { bagSettings, currentBag } from '@/lib/shop/bag';
import { reassurance } from '@/lib/shop/bag-model';
import { bagPickCards, cardsByIds } from '@/lib/shop/catalogue';
import { keysOf, SHOP_DICTS } from '@/lib/shop/dict';
import { readPageSettings, shopContext, type ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { telHref, waHref } from '@/lib/shop/links';
import { shopMetadata, shopOrigin } from '@/lib/shop/meta';
import { isBottom } from '@/lib/shop/pdp-chart';
import { sizeGroupOf, sizeWordsFor } from '@/lib/shop/usual-size';
import { canonicalFor } from '@/lib/shop/pdp-colour';
import { careList, detailBlocks, fabricLine } from '@/lib/shop/pdp-details';
import { finderOffered, FIT_COOKIE, readFit, sizeFor } from '@/lib/shop/pdp-finder';
import { payWords } from '@/lib/shop/pdp-price';
import { readRecent, RECENT_COOKIE } from '@/lib/shop/pdp-rows';
import { ruleCells } from '@/lib/shop/pdp-rules';
import { TEMPLATE_QUERY, templateFor } from '@/lib/shop/pdp-template';
import { beforeCutoff, clockIn, cutoffWords } from '@/lib/shop/pdp-stock';
import { trustFacts, trustItems } from '@/lib/shop/pdp-trust';
import { liveFreeOverMinor, productExchangeTerms } from '@/lib/rules-public';
import { productData } from '@/lib/shop/product';
import { colourPath, isOneSize, nameParts, NO_COLOUR, openingColour, productRoute, stockOf, type PdpModel } from '@/lib/shop/product-model';
import { toModel } from '@/lib/shop/product-view';
import { COLOUR_QUERY, ROUTES } from '@/lib/shop/routes';
import { categoryName } from '@/lib/shop/shell-model';
import { breadcrumbLd, largestUrl, productLd } from '@/lib/shop/structured-data';
import { setCardGroups } from '@/lib/shop/combo';
import { AddedPanel } from '../bag/AddedPanel';
import { SetOffer } from '../combo/SetCards';
import { CardDeskMount } from '../CardDeskMount';
import '../bag/bag.css';
import { HeartButton } from '../HeartButton';
import { JsonLd } from '../JsonLd';
import { Bold } from './Bold';
import { PdpBuy, PdpDeskBar, PdpPhoneBar, type BuyLinks } from './PdpBuy';
import { PdpColour } from './PdpColour';
import { PdpDetails, type DetailBlockView } from './PdpDetails';
import { PdpEffects } from './PdpEffects';
import { FinderCard, FinderPopup } from './PdpFinder';
import { PdpGallery } from './PdpGallery';
import { PdpNotify } from './PdpNotify';
import { PdpPrice } from './PdpPrice';
import { PdpQa } from './PdpQa';
import { PdpRail } from './PdpRail';
import { PdpShare } from './PdpShare';
import { PdpRecentMark } from './PdpRecentMark';
import { PdpRoot, type PdpEnv } from './PdpRoot';
import { PdpRows } from './PdpRows';
import { PdpRules } from './PdpRules';
import { PdpSizes } from './PdpSizes';
import { PdpT3Card } from './PdpT3Card';
import { PdpStock } from './PdpStock';
import { PdpTrust } from './PdpTrust';
import './pdp.css';

const KEYS = [
  'seo.structuredData',
  'pdp.sizeWords',
  'pdp.usualSize',
  'pdp.page',
  'pdp.gallery',
  'pdp.colour',
  'pdp.size',
  'pdp.chart',
  'pdp.stock',
  'pdp.price',
  'pdp.trust',
  'pdp.rules',
  'pdp.details',
  'pdp.buy',
  'pdp.sweep',
  'pdp.qa',
  'pdp.fit',
  'pdp.rows',
  'pdp.icons',
  'pdp.share',
  'pdp.templates',
  'pdp.finder',
  'catalogue.sizeCharts.diagramFor',
  'policy.exchange.summary',
  'policy.returns.summary',
  'policy.returns.afterDelivery',
  // PR 102: the matching set offer above the buttons
  'combos.pdpOffer',
] as const;

export type ProductSearch = Record<string, string | string[] | undefined>;

const settingsFor = cache((storeId: number) => readPageSettings(KEYS, storeId));
const dataFor = cache((storeId: number, slug: string) => productData(storeId, slug));

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** The product page an address names (or null: not a product address), with its data and settings. */
export async function productPage(c: ShopContext, search: ProductSearch) {
  const route = productRoute(c.path, c.s['naming.productPathPrefix']);
  if (!route) return null;
  const [set, data] = await Promise.all([settingsFor(c.storeId), dataFor(c.storeId, route.slug)]);
  if (!data) return { route, set, data: null, model: null, colour: null };
  // a colour's own address only while colour paths are on, and only for a colour the product has
  if (route.colour && (!set['pdp.page'].colourPaths || !data.colours.some((x) => x.key === route.colour))) return { route, set, data: null, model: null, colour: null };
  const model = toModel(data, c.lang, set['pdp.gallery'].drawingViews, {
    money: c.money,
    off: (n) => c.t('pdp.price.off', { n: c.num(n) }),
    save: (amount) => c.t('pdp.price.save', { amount }),
  });
  const colour = openingColour(model, route.colour ?? one(search[COLOUR_QUERY]));
  return { route, set, data, model, colour };
}

export async function productMetadata(c: ShopContext, search: ProductSearch): Promise<Metadata> {
  const p = await productPage(c, search);
  if (!p?.data || !p.model) return {};
  const { data, model, route, set } = p;
  const colourName = route.colour ? model.colours.find((x) => x.key === route.colour)?.name : null;
  const title = colourName ? `${model.name} · ${colourName}` : model.name;
  const prefix = c.s['naming.productPathPrefix'];
  const m = await shopMetadata(c, `${prefix.replace(/^\/+|\/+$/g, '')}/${data.slug}`, title);
  const base = hrefIn(c.lang, `${prefix.replace(/\/+$/, '')}/${encodeURIComponent(data.slug)}`);
  m.alternates = { ...m.alternates, canonical: canonicalFor(base, route.colour, data.category?.slug ?? null, set['pdp.page']) };
  const desc = (c.lang === 'bn' && data.descriptionBn?.trim()) || data.descriptionEn?.trim();
  if (desc) m.description = desc.length > 160 ? `${desc.slice(0, 157).trimEnd()}…` : desc;
  // PR 52: a template preview (`?template=T2`) is never indexed; the canonical above already names the plain address
  if (one(search[TEMPLATE_QUERY])) m.robots = { index: false, follow: true };
  return m;
}

/** Every word of the page (`pdp.*` as they are, Find My Size's as `finder.*`, with the owner's own), {slots} left open
 * for the client parts to fill. */
/** The words the page's client parts need: every `pdp.*`, Find My Size's only where it is offered, and the T3 card's
 * only on T3, so a page carries no words it cannot show. */
function pageWords(c: ShopContext, finderOn: boolean, t3: boolean): Record<string, string> {
  const pdp = SHOP_DICTS.en.pdp;
  const finder = SHOP_DICTS.en.finder;
  const keys = pdp && typeof pdp === 'object' ? keysOf(pdp) : [];
  const fk = finder && typeof finder === 'object' ? keysOf(finder, 'finder.').filter((k) => (k.startsWith('finder.t3.') ? t3 : finderOn)) : [];
  return Object.fromEntries([...keys.map((k) => [k, c.t(`pdp.${k}`)]), ...fk.map((k) => [k, c.t(k)])]);
}

/** Follow-up 62 · "Your size" words (shop dictionary `usualSize.*`), read by the size row as `usual.*`. */
function usualWords(c: ShopContext): Record<string, string> {
  return Object.fromEntries((['tag', 'aria', 'out', 'inStock'] as const).map((k) => [`usual.${k}`, c.t(`usualSize.${k}`)]));
}

/** Where the fit sits on "Runs small · True to size · Runs large" (demo pdp_fitPos), from the fit words. */
function fitPosOf(fit: string | null, note: string | null): number | null {
  const n = `${note ?? ''} ${fit ?? ''}`;
  if (!n.trim()) return null;
  if (/small|go up/i.test(note ?? '')) return 24;
  if (/slim/i.test(n)) return 36;
  if (/relaxed|size down|roomy|large|oversized/i.test(n)) return 72;
  return 50;
}

export async function ProductPage({ search }: { search: ProductSearch }) {
  const c = await shopContext();
  const p = await productPage(c, search);
  if (!p?.data || !p.model) notFound();
  const { data, set, colour } = p;
  const m: PdpModel = p.model;
  const t = c.t;
  const lang = c.lang;
  const prefix = c.s['naming.productPathPrefix'];
  const productHref = hrefIn(lang, `${prefix.replace(/\/+$/, '')}/${encodeURIComponent(data.slug)}`);

  // ---- PR 52 · which template: the product's own, its category's, the shop's default (or the admin's preview) ----
  const tpl = templateFor(set['pdp.templates'], data, data.categoryChain, one(search[TEMPLATE_QUERY])).template;
  const t2 = set['pdp.templates'].t2;
  const t3 = set['pdp.templates'].t3;
  const sizeProps = { oneSizeNote: data.fitNote, fitPos: set['pdp.size'].fitBar ? fitPosOf(data.fit, data.fitNote) : null, fitWord: data.fit ?? '' };
  const tplClass = tpl === 'T2' ? `${t2.surface ? ' pdp-t2surf' : ''}${t2.editorialTitle ? ' pdp-t2ed' : ''}` : '';

  // ---- PR 61 · price row ----
  const pr = set['pdp.price'];
  const pay = payWords(pr.payLine.text?.[lang] ?? null, c.flags.cod, t('pdp.price.cod'));

  // ---- PR 60 · the stock line's dispatch time ----
  const cutoff = set['pdp.stock'].dispatchCutoff;
  const cutWords = cutoff ? cutoffWords(cutoff, lang).replace(/[0-9]/g, (d) => c.num(Number(d))) : null;

  // ---- PR 62 · promises, read live from Smart Rules ----
  const firstVariant = [...data.variants].filter((v) => v.priceMinor !== null).sort((a, b) => (a.priceMinor ?? 0) - (b.priceMinor ?? 0))[0];
  const [exTerms, freeOver] = await Promise.all([
    productExchangeTerms({ storeId: c.storeId, productId: data.id }),
    firstVariant ? liveFreeOverMinor({ storeId: c.storeId, variantId: firstVariant.id }) : Promise.resolve(null),
  ]);
  const tf = trustFacts({ exchange: exTerms, freeOverMinor: freeOver }, { exchangeOn: c.flags.exchange, windowHours: c.s['policy.exchange.windowHours'] });
  const trust = trustItems(set['pdp.trust'], { exchange: tf.exchangeHours !== null, freeDelivery: tf.freeOverMinor !== null }).map((id) => ({
    id,
    text:
      id === 'exchange'
        ? t('pdp.trust.exchange', { n: c.num(tf.exchangeHours ?? 0) })
        : id === 'freeDelivery'
          ? t('pdp.trust.free', { amount: c.money(tf.freeOverMinor ?? 0) })
          : t('pdp.trust.original'),
  }));

  // ---- PR 63 · Delivery · Exchange · Returns ----
  const rl = set['pdp.rules'];
  const texts = rl.on ? await data.ruleTexts(lang) : [];
  // the window the promise row says (the live exchange rule, else the policy setting): one number on the page
  const hours = c.num(tf.exchangeHours ?? c.s['policy.exchange.windowHours']);
  const cells = ruleCells(
    rl,
    texts,
    {
      freeDelivery: data.freeDelivery,
      exchange: { on: tf.exchangeHours !== null, summary: t.label(set['policy.exchange.summary'], { windowHours: hours }), value: t('pdp.rules.hours', { n: hours }) },
      returns: { summary: t.label(set['policy.returns.summary']), afterDelivery: set['policy.returns.afterDelivery'] },
    },
    { free: t('pdp.rules.free'), more: t('pdp.rules.more'), swapOnly: t('pdp.rules.swapOnly') },
  );

  // ---- PR 64 · details ----
  const fabric = fabricLine(lang === 'bn' ? (data.fabricBn ?? data.fabricEn) : data.fabricEn, data.gsm, (n) => t('pdp.details.gsm', { n: c.num(n) }));
  const care = careList(lang === 'bn' ? (data.careBn ?? data.careEn) : data.careEn);
  const description = (lang === 'bn' && data.descriptionBn?.trim()) || data.descriptionEn?.trim() || null;
  const blocks: DetailBlockView[] = detailBlocks(set['pdp.details'], { fabric, care, fit: data.fit, fitNote: data.fitNote, description }).map((b) => ({
    ...b,
    title: t(`pdp.details.${b.id}`),
    body:
      b.id === 'fabric' ? (
        <>
          {fabric ? (
            <div className="acc-first">
              <span className="bold" style={{ color: 'var(--ink)' }}>
                {t('pdp.details.fabricH')}
              </span>
              <br />
              {fabric}
            </div>
          ) : null}
          {care.length ? (
            <div className={fabric ? 'mt12' : 'acc-first'}>
              <span className="bold" style={{ color: 'var(--ink)' }}>
                {t('pdp.details.careH')}
              </span>
              <ul>
                {care.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : b.id === 'fit' ? (
        <>
          {data.fit ? (
            <div className="acc-first">
              <span className="bold" style={{ color: 'var(--ink)' }}>
                {t('pdp.details.fitH')}
              </span>{' '}
              {data.fit}
            </div>
          ) : null}
          {data.fitNote ? (
            <div className={data.fit ? undefined : 'acc-first'}>
              <span className="bold" style={{ color: 'var(--ink)' }}>
                {t('pdp.details.noteH')}
              </span>{' '}
              {data.fitNote}
            </div>
          ) : null}
        </>
      ) : (
        <div className="acc-first">
          {(description ?? '').split(/\n{2,}/).map((para, i) => (
            <p key={i} style={{ margin: i ? '8px 0 0' : 0 }}>
              {para}
            </p>
          ))}
        </div>
      ),
  }));

  // ---- PR 68 · the heart's place and the floating rail ----
  const icons = set['pdp.icons'];
  const heartWords = { save: t('card.save'), unsave: t('card.unsave'), saved: t('card.saved'), removed: t('card.removed'), full: t('wish.full'), error: t('wish.error') };
  const railWa = icons.panel && icons.whatsapp ? waHref(c.s['contact.whatsapp'], t('rail.waMessage', { ...c.vars, name: m.name })) : null;

  // ---- PR 67 · the rows at the foot of the page ----
  const rows = set['pdp.rows'];
  const jar = await cookies();
  const recentIds = rows.recent ? readRecent(jar.get(RECENT_COOKIE)?.value, rows.recentKeep) : [];

  // ---- PR 58 · Find My Size: offered only where the chart can answer; a kept answer chooses its size when it is in stock ----
  const fs = set['pdp.finder'];
  const finder = finderOffered(m, fs) ? fs : null;
  const fitKept = finder && finder.remember ? readFit(jar.get(FIT_COOKIE)?.value, finder) : null;
  const keptSize = finder && fitKept ? sizeFor(m, finder, fitKept)?.size : null;
  const openSize = m.sizes.length === 1 ? m.sizes[0]!.key : keptSize && stockOf(m, colour, keptSize) > 0 ? keptSize : null;

  // ---- PR 49 · buttons and links; the bag is S04's (follow-up 38) ----
  const buy = set['pdp.buy'];
  const bagSet = await bagSettings(c.storeId);
  const phone = telHref(c.s['contact.phone']);
  const links: BuyLinks = {
    bagHref: hrefIn(lang, ROUTES.bag),
    behaviour: bagSet['bag.addBehaviour'],
    bagWords: {
      added: t('bag.toast.added'),
      already: t('bag.toast.already'),
      error: t('bag.toast.error'),
      stock: t('bag.toast.stock'),
      tooMany: t('bag.toast.tooMany'),
      notForSale: t('bag.toast.notForSale'),
    },
    checkoutHref: hrefIn(lang, ROUTES.checkout),
    call: buy.callToOrder && phone ? { href: phone, hours: c.s['contact.hours']?.[lang] ?? null } : null,
    freeDelivery: data.freeDelivery,
    cod: c.flags.cod,
  };
  const chartWa = set['pdp.chart'].askWhatsapp ? waHref(c.s['contact.whatsapp'], t('pdp.chart.waMessage', { ...c.vars, name: m.name })) : null;

  // the first photo's badge: the honest discount, else the product's first tag
  const cheapest = [...m.prices].sort((a, b) => a.minor - b.minor)[0];
  const badge = cheapest?.pct ? { text: cheapest.pct, sale: true } : data.tag ? { text: data.tag, sale: false } : null;

  const env: PdpEnv = {
    lang,
    m,
    set: {
      gallery: set['pdp.gallery'],
      colour: set['pdp.colour'],
      size: set['pdp.size'],
      chart: set['pdp.chart'],
      stock: set['pdp.stock'],
      buy,
      sweep: set['pdp.sweep'],
      fit: set['pdp.fit'],
      colourPaths: set['pdp.page'].colourPaths,
      sizeWords: sizeWordsFor(set['pdp.sizeWords'], lang),
      usual: set['pdp.usualSize'].on
        ? { preselect: set['pdp.usualSize'].preselect, days: set['pdp.usualSize'].days, group: sizeGroupOf(data.garment, set['catalogue.sizeCharts.diagramFor']) }
        : null,
    },
    words: { ...pageWords(c, finder !== null, tpl === 'T3'), ...usualWords(c) },
    bnDigits: lang === 'bn' && c.bnDigits,
    productHref,
    shipsToday: beforeCutoff(clockIn(c.s['store.timeZone']), cutoff),
    chartWa,
    chartBottom: isBottom(data.garment, set['catalogue.sizeCharts.diagramFor']),
    finder,
    fitKept,
  };
  // ---- PR 102 · the sets this product is in, on sale now (one line each, above the buttons) ----
  const offerSet = set['combos.pdpOffer'];
  const offer = offerSet.on && m.onSale ? await setCardGroups(c, { productId: data.id }) : null;
  const [head, last] = nameParts(m.name);
  const cat = data.category;
  // the added-to-bag panel (S04 · PR 106) for `?added=<line>`; closing it returns to this same address without it
  const added = one(search.added);
  const view = added ? await currentBag(c) : null;
  const [bagCards, picks] = view
    ? await Promise.all([cardsByIds(c.storeId, view.items.map((i) => i.productId)), bagPickCards(c.storeId, view.productIds, bagSet['bag.panel.picks'])])
    : [null, null];
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) if (k !== 'added' && typeof v === 'string') keep.set(k, v);
  const closeHref = `${p.route.colour ? colourPath(productHref, p.route.colour) : productHref}${keep.size ? `?${keep.toString()}` : ''}`;

  // ---- follow-up 61 · the product for search engines, from what this page shows: its trail, price and stock ----
  const sd = set['seo.structuredData'];
  const here = await shopOrigin();
  const pageHref = p.route.colour ? colourPath(productHref, p.route.colour) : productHref;
  const ldVariants = p.route.colour ? data.variants.filter((v) => v.colour === p.route.colour) : data.variants;
  const ld = here ? (
    <JsonLd
      data={[
        sd.breadcrumbs
          ? breadcrumbLd(here, [
              { name: t('pdp.home'), href: hrefIn(lang, ROUTES.home) },
              ...(cat ? [{ name: categoryName(cat, lang), href: hrefIn(lang, ROUTES.category(cat.slug)) }] : []),
              { name: m.name, href: pageHref },
            ])
          : null,
        sd.product
          ? productLd(here, {
              name: m.name,
              href: pageHref,
              description,
              images: (m.shots[colour ?? NO_COLOUR] ?? []).flatMap((x) => {
                const u = largestUrl(x.photo);
                return u ? [u] : [];
              }),
              brand: data.brandName ?? c.storeName,
              category: cat ? categoryName(cat, lang) : null,
              currency: c.s['store.currency'],
              onSale: data.state === 'live',
              variants: ldVariants,
            })
          : null,
      ]}
    />
  ) : null;

  return (
    <PdpRoot env={env} initial={{ colour, size: openSize }}>
      <div className={`pdp-page pdp-tpl-${tpl}${tplClass}`} data-testid="pdp" data-template={tpl} data-state={data.state}>
        <div className="container pdp-top">
          {set['pdp.page'].breadcrumb ? (
            <nav className="crumbs pdp-crumbs" aria-label={t('pdp.breadcrumb')}>
              <a href={hrefIn(lang, ROUTES.home)}>{t('pdp.home')}</a>
              <span aria-hidden="true">/</span>
              {cat ? (
                <>
                  <a href={hrefIn(lang, ROUTES.category(cat.slug))}>{categoryName(cat, lang)}</a>
                  <span aria-hidden="true">/</span>
                </>
              ) : null}
              <span aria-current="page" style={{ color: 'var(--ink)' }}>
                {m.name}
              </span>
            </nav>
          ) : null}
          <div
            className={`pdp-grid${tpl === 'T2' ? ' t2' : ''}`}
            style={tpl === 'T2' ? ({ '--pdp-t2buy': `${t2.deskBuyPx}px` } as React.CSSProperties) : undefined}
          >
            <div className="pdp-g">
              <PdpGallery badge={badge} lang={lang} template={tpl} t2={t2} t3={t3} />
            </div>
            <div className="pdp-b sticky-d" id="pdp-buy">
              <div className="pdp-sec pdp-head">
                <div className="pdp-titlerow">
                  <h1 className="h1 pdp-name">
                    {head}
                    <span className="pdp-nmend">
                      {last}
                      {icons.wish === 'title' ? <HeartButton id={m.productId} className="pdp-wish" size={22} testId="pdp-wish" words={heartWords} /> : null}
                    </span>
                  </h1>
                </div>
                {icons.panel ? (
                  <PdpRail
                    set={icons}
                    productId={m.productId}
                    wa={railWa}
                    waLabel={t('rail.wa')}
                    heart={icons.wish === 'rail' ? heartWords : null}
                  >
                    {icons.share ? (
                      <PdpShare
                        set={set['pdp.share']}
                        words={{
                          open: t('share.open'),
                          group: t('share.group'),
                          on: t('share.on'),
                          copy: t('share.copy'),
                          copied: t('share.copied'),
                          pasteInsta: t('share.pasteInsta'),
                          text: t('share.text', { ...c.vars, name: m.name }),
                          net: { facebook: t('share.net.facebook'), messenger: t('share.net.messenger'), whatsapp: t('share.net.whatsapp'), instagram: t('share.net.instagram') },
                        }}
                      />
                    ) : null}
                  </PdpRail>
                ) : null}
                <PdpPrice set={pr} freeDelivery={data.freeDelivery} payWords={pay} />
              </div>
              <PdpColour lang={lang} />
              {tpl === 'T3' && !isOneSize(m) ? (
                <>
                  <PdpT3Card t3={t3} sizes={sizeProps} />
                  {t3.inlineFinder ? null : <FinderCard />}
                </>
              ) : (
                <>
                  <PdpSizes {...sizeProps} />
                  <FinderCard />
                </>
              )}
              <PdpStock cutoffWords={cutWords} />
              {offer ? <SetOffer c={c} groups={offer.groups.slice(0, offerSet.max)} all={offer} /> : null}
              <PdpBuy links={links} />
              <PdpTrust items={trust} />
              {!m.onSale ? (
                <div className="pdp-sec">
                  <a className="btn btn-ghost btn-block" href={hrefIn(lang, cat ? ROUTES.category(cat.slug) : ROUTES.newIn)}>
                    <Bold text={t('pdp.ghost.more')} />
                  </a>
                  {set['pdp.size'].notifyBack ? <PdpNotify variantId={null} what={m.name} /> : null}
                </div>
              ) : null}
            </div>
            <div className="pdp-d">
              <div className="stack s16">
                <PdpRules
                  cells={cells}
                  heads={{ delivery: t('pdp.rules.delivery'), exchange: t('pdp.rules.exchange'), returns: t('pdp.rules.returns') }}
                  hide={t('pdp.rules.hide')}
                  trial={rl.on && rl.trialLine ? t('pdp.rules.trial') : null}
                />
                <PdpDetails blocks={blocks} more={t('pdp.details.more')} />
              </div>
            </div>
          </div>
        </div>
        <PdpQa c={c} set={set['pdp.qa']} productId={m.productId} name={m.name} />
        <PdpRows
          c={c}
          set={rows}
          product={{ id: m.productId, categorySlug: data.category?.slug ?? null, garment: data.garment }}
          diagramFor={set['catalogue.sizeCharts.diagramFor']}
          recentIds={recentIds}
        />
        {rows.recent ? <PdpRecentMark id={m.productId} keep={rows.recentKeep} days={rows.recentDays} /> : null}
        <PdpPhoneBar links={links} />
        <PdpDeskBar links={links} lang={lang} />
        {view && added && bagCards ? (
          <AddedPanel
            c={c}
            view={view}
            lineId={added}
            s={bagSet}
            cards={bagCards}
            picks={picks?.cards ?? []}
            trust={reassurance(c.flags, { securePayment: bagSet['bag.trust.securePayment'], originalLine: bagSet['bag.upsell.originalLine'] })}
            closeHref={closeHref}
          />
        ) : null}
        <FinderPopup />
        <PdpEffects />
        {ld}
        {/* follow-up 21: the rows' cards get the back view and Quick add on a computer with a mouse */}
        <CardDeskMount c={c} />
      </div>
    </PdpRoot>
  );
}
