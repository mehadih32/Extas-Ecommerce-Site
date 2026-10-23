// PR 49 — the product page, template T1 (Blueprint D3.5–D3.8, demo 30-product.js PAGES.product): on a phone the photo,
// then the buy column (title and heart, price row, colours, sizes, stock line, the buttons, the promise row), then
// Delivery · Exchange · Returns and the details, with the buy bar held at the bottom of the screen; on a computer the
// photos on the left, the buy column on the right (sticky), the details under it, and the slim bar once the buttons
// have scrolled away. Templates T2 and T3 draw as T1 until they are built. A product taken off sale keeps its page,
// everything shown sold out (PR 36). The parts that change with the shopper's choice are small client parts sharing
// one state (PdpRoot); the rest is drawn here.
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
import { shopMetadata } from '@/lib/shop/meta';
import { isBottom } from '@/lib/shop/pdp-chart';
import { canonicalFor } from '@/lib/shop/pdp-colour';
import { careList, detailBlocks, fabricLine } from '@/lib/shop/pdp-details';
import { payWords } from '@/lib/shop/pdp-price';
import { readRecent, RECENT_COOKIE } from '@/lib/shop/pdp-rows';
import { ruleCells } from '@/lib/shop/pdp-rules';
import { beforeCutoff, clockIn, cutoffWords } from '@/lib/shop/pdp-stock';
import { trustFacts, trustItems } from '@/lib/shop/pdp-trust';
import { liveFreeOverMinor, productExchangeTerms } from '@/lib/rules-public';
import { productData } from '@/lib/shop/product';
import { colourPath, nameParts, openingColour, productRoute, type PdpModel } from '@/lib/shop/product-model';
import { toModel } from '@/lib/shop/product-view';
import { COLOUR_QUERY, ROUTES } from '@/lib/shop/routes';
import { categoryName } from '@/lib/shop/shell-model';
import { AddedPanel } from '../bag/AddedPanel';
import '../bag/bag.css';
import { HeartButton } from '../HeartButton';
import { Bold } from './Bold';
import { PdpBuy, PdpDeskBar, PdpPhoneBar, type BuyLinks } from './PdpBuy';
import { PdpColour } from './PdpColour';
import { PdpDetails, type DetailBlockView } from './PdpDetails';
import { PdpEffects } from './PdpEffects';
import { PdpGallery } from './PdpGallery';
import { PdpNotify } from './PdpNotify';
import { PdpPrice } from './PdpPrice';
import { PdpRail } from './PdpRail';
import { PdpShare } from './PdpShare';
import { PdpRecentMark } from './PdpRecentMark';
import { PdpRoot, type PdpEnv } from './PdpRoot';
import { PdpRows } from './PdpRows';
import { PdpRules } from './PdpRules';
import { PdpSizes } from './PdpSizes';
import { PdpStock } from './PdpStock';
import { PdpTrust } from './PdpTrust';
import './pdp.css';

const KEYS = [
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
  'pdp.fit',
  'pdp.rows',
  'pdp.icons',
  'pdp.share',
  'catalogue.sizeCharts.diagramFor',
  'policy.exchange.summary',
  'policy.returns.summary',
  'policy.returns.afterDelivery',
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
  return m;
}

/** Every word of the page (`pdp.*`, with the owner's own), {slots} left open for the client parts to fill. */
function pageWords(c: ShopContext): Record<string, string> {
  const pdp = SHOP_DICTS.en.pdp;
  const keys = pdp && typeof pdp === 'object' ? keysOf(pdp) : [];
  return Object.fromEntries(keys.map((k) => [k, c.t(`pdp.${k}`)]));
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
  const recentIds = rows.recent ? readRecent((await cookies()).get(RECENT_COOKIE)?.value, rows.recentKeep) : [];

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
    },
    words: pageWords(c),
    bnDigits: lang === 'bn' && c.bnDigits,
    productHref,
    shipsToday: beforeCutoff(clockIn(c.s['store.timeZone']), cutoff),
    chartWa,
    chartBottom: isBottom(data.garment, set['catalogue.sizeCharts.diagramFor']),
  };
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

  return (
    <PdpRoot env={env} initial={{ colour, size: m.sizes.length === 1 ? m.sizes[0]!.key : null }}>
      <div className="pdp-page pdp-tpl-T1" data-testid="pdp" data-template="T1" data-state={data.state}>
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
          <div className="pdp-grid">
            <div className="pdp-g">
              <PdpGallery badge={badge} lang={lang} />
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
              <PdpSizes oneSizeNote={data.fitNote} fitPos={set['pdp.size'].fitBar ? fitPosOf(data.fit, data.fitNote) : null} fitWord={data.fit ?? ''} />
              <PdpStock cutoffWords={cutWords} />
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
        <PdpEffects />
      </div>
    </PdpRoot>
  );
}
