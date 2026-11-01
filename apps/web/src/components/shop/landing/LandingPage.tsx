// S13 · PR 254 (Blueprint MKT-05, demo 70-landing.js) — the landing page's parts, in their fixed order, each only while
// the owner has it on: the hero with the offer, the photos, why this product, the size chart with the try-on line, the
// reviews, the order box, the questions (the shop's own delivery, exchange and returns rules) and the countdown. On a
// phone it is one column with the order box in its place; on a desktop the order box stays beside the parts.
import { notFound } from 'next/navigation';
import { getPrisma } from '@extas/db/client';
import { liveFreeOverMinor, productExchangeTerms } from '@/lib/rules-public';
import { landingSource, secondsLeft, showsTryOn, type LandingSection } from '@/lib/marketing/landing-model';
import { readPageSettings, type ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { payWords } from '@/lib/shop/pdp-price';
import { productReviews } from '@/lib/shop/pdp-reviews-load';
import { ruleCells } from '@/lib/shop/pdp-rules';
import { trustFacts } from '@/lib/shop/pdp-trust';
import { productData } from '@/lib/shop/product';
import { NO_COLOUR, type PdpModel } from '@/lib/shop/product-model';
import { toModel } from '@/lib/shop/product-view';
import { ROUTES } from '@/lib/shop/routes';
import { PdpReviews } from '../product/PdpReviews';
import { PdpRules } from '../product/PdpRules';
import { ShotPicture } from '../product/ShotPicture';
import { LandingOrder, type OrderVariant } from './LandingOrder';
import { LandingTimer } from './LandingTimer';
// the product page's own styles for the parts shared with it (the rules box, the reviews, the photos)
import '../product/pdp.css';
import './landing.css';

const KEYS = ['pdp.rules', 'pdp.reviews', 'pdp.gallery', 'pdp.price', 'checkout.tryOn.enabled', 'policy.exchange.summary', 'policy.returns.summary', 'policy.returns.afterDelivery'] as const;

export interface LandingPageData {
  id: string;
  slug: string;
  titleEn: string;
  titleBn: string | null;
  productId: string;
  sections: LandingSection[];
}

export async function LandingPage({ c, page }: { c: ShopContext; page: LandingPageData }) {
  const t = c.t;
  const lang = c.lang;
  const row = await getPrisma().product.findFirst({ where: { id: page.productId, storeId: c.storeId }, select: { slug: true } });
  const [set, data] = await Promise.all([readPageSettings(KEYS, c.storeId), row ? productData(c.storeId, row.slug) : Promise.resolve(null)]);
  if (!data) notFound();
  const m: PdpModel = toModel(data, lang, set['pdp.gallery'].drawingViews, { money: c.money, off: (n) => t('pdp.price.off', { n: c.num(n) }), save: (amount) => t('pdp.price.save', { amount }) });
  const on = (k: LandingSection['key']) => page.sections.find((s) => s.key === k && s.on) ?? null;
  const title = (lang === 'bn' && page.titleBn) || page.titleEn;
  const colour = m.colours.find((x) => m.variants.some((v) => v.colour === x.key && v.stock > 0)) ?? m.colours[0] ?? null;
  const ck = colour?.key ?? NO_COLOUR;
  const shots = m.shots[ck] ?? m.shots[NO_COLOUR] ?? [];
  const hex = colour?.hex ?? '#e8e4dc';
  const low = m.variants.filter((v) => v.stock > 0).map((v) => m.prices[v.price]).sort((a, b) => (a?.minor ?? 0) - (b?.minor ?? 0))[0] ?? m.prices[0] ?? null;
  const pay = payWords(set['pdp.price'].payLine.text?.[lang] ?? null, c.flags.cod, t('pdp.price.cod'));
  // SIM-F-034: the same "try it on in front of the rider" the checkout and the product page promise
  const trial = showsTryOn({ tryOn: set['checkout.tryOn.enabled'], rules: set['pdp.rules'] }) ? t('pdp.rules.trial') : null;

  const hero = on('hero');
  const offer = hero?.config.offer ? (lang === 'bn' && hero.config.offer.bn) || hero.config.offer.en : null;
  const benefits = (on('benefits')?.config.lines ?? []).map((l) => (lang === 'bn' && l.bn) || l.en).filter(Boolean);
  const timer = on('timer');
  const endsAt = timer?.config.endsAt && secondsLeft(timer.config.endsAt, new Date()) ? timer.config.endsAt : null;
  const size = on('size') && m.chart ? m.chart : null;

  // the questions: the shop's own delivery, exchange and returns rules, as the product page reads them (PR 62, 63)
  let cells: ReturnType<typeof ruleCells> = [];
  if (on('faq') && set['pdp.rules'].on) {
    const firstVariant = [...data.variants].filter((v) => v.priceMinor !== null).sort((a, b) => (a.priceMinor ?? 0) - (b.priceMinor ?? 0))[0];
    const [exTerms, freeOver, texts] = await Promise.all([
      productExchangeTerms({ storeId: c.storeId, productId: data.id }),
      firstVariant ? liveFreeOverMinor({ storeId: c.storeId, variantId: firstVariant.id }) : Promise.resolve(null),
      data.ruleTexts(lang),
    ]);
    const tf = trustFacts({ exchange: exTerms, freeOverMinor: freeOver }, { exchangeOn: c.flags.exchange, windowHours: c.s['policy.exchange.windowHours'] });
    const hours = c.num(tf.exchangeHours ?? c.s['policy.exchange.windowHours']);
    cells = ruleCells(
      set['pdp.rules'],
      texts,
      {
        freeDelivery: data.freeDelivery,
        exchange: { on: tf.exchangeHours !== null, summary: t.label(set['policy.exchange.summary'], { windowHours: hours }), value: t('pdp.rules.hours', { n: hours }) },
        returns: { summary: t.label(set['policy.returns.summary']), afterDelivery: set['policy.returns.afterDelivery'] },
      },
      { free: t('pdp.rules.free'), more: t('pdp.rules.more'), swapOnly: t('pdp.rules.swapOnly') },
    );
  }
  const revSet = set['pdp.reviews'];
  const reviews = on('reviews') && revSet.on ? await productReviews(c.storeId, m.productId, revSet.max) : null;

  const variants: OrderVariant[] = m.variants.map((v) => ({ id: v.id, colour: v.colour, size: v.size, stock: m.onSale ? v.stock : 0, price: m.prices[v.price]?.now ?? '' }));
  const w = (k: string) => t(`landing.${k}`);
  const digits = Array.from({ length: 10 }, (_, i) => c.num(i));

  return (
    <div className="container lp-wrap" data-testid="landing" data-page={page.slug}>
      <div className="lp-grid">
        {hero ? (
          <section className="lp-s lp-hero" data-part="hero">
            {shots[0] ? <ShotPicture shot={shots[0]} garment={m.garment} hex={hex} slot="main" sizes="(min-width: 1024px) 60vw, 100vw" alt={m.name} lang={lang} ratio="ratio-11" priority /> : null}
            <h1 className="lp-title">{title}</h1>
            {offer ? <p className="lp-offer-ln">{offer}</p> : null}
            <div className="row lp-pr">
              {low ? <b className="lp-now">{low.now}</b> : null}
              {low?.was ? <s className="muted">{low.was}</s> : null}
              {pay ? <span className="small text2">{pay}</span> : null}
            </div>
            <a className="btn btn-primary btn-block lp-cta" href="#lp-order">
              {w('orderNow')}
            </a>
          </section>
        ) : null}
        {endsAt ? (
          <section className="lp-s" data-part="timer">
            <LandingTimer endsAt={endsAt} label={w('timer')} units={{ d: w('units.d'), h: w('units.h'), m: w('units.m'), s: w('units.s') }} num={digits} />
          </section>
        ) : null}
        {on('form') ? (
          <section className="lp-formcol" id="lp-order" data-part="form">
            <h2 className="h2 mb12">{w('form')}</h2>
            {m.onSale ? (
              <LandingOrder
                colours={m.colours.map((x) => ({ key: x.key, name: x.name, hex: x.hex }))}
                sizes={m.sizes}
                variants={variants}
                source={landingSource(page.id)}
                checkoutHref={hrefIn(lang, ROUTES.checkout)}
                trial={on('size') ? null : trial}
                words={{ colour: w('colour'), size: w('sizePick'), soldOut: w('soldOut'), order: w('orderNow'), adding: w('adding'), failed: w('failed'), pick: w('pick'), sub: w('formSub') }}
              />
            ) : (
              <p className="small text2" data-testid="lp-not-on-sale">
                {w('notOnSale')}
              </p>
            )}
          </section>
        ) : null}
        {on('gallery') && shots.length > 1 ? (
          <section className="lp-s" data-part="gallery">
            <h2 className="h2 mb12">{w('gallery')}</h2>
            <div className="lp-shots">
              {shots.slice(1).map((s) => (
                <ShotPicture key={s.id} shot={s} garment={m.garment} hex={hex} slot="main" sizes="(min-width: 1024px) 30vw, 50vw" alt={m.name} lang={lang} ratio="ratio-45" />
              ))}
            </div>
          </section>
        ) : null}
        {benefits.length ? (
          <section className="lp-s" data-part="benefits">
            <h2 className="h2 mb12">{w('benefits')}</h2>
            <ul className="lp-ben">
              {benefits.map((b, i) => (
                <li key={i} className="card">
                  {b}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {size || (on('size') && trial) ? (
          <section className="lp-s" data-part="size">
            {size ? (
              <>
                <h2 className="h2 mb12">
                  {w('size')} <span className="small muted">({w('sizeIn')})</span>
                </h2>
                <div className="tbl-wrap">
                  <table className="tbl" data-testid="lp-chart">
                    <thead>
                      <tr>
                        <th scope="col">{w('sizePick')}</th>
                        {size.fields.map((f) => (
                          <th key={f.key} scope="col">
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {size.rows.map((r) => (
                        <tr key={r.size}>
                          <th scope="row">{m.sizes.find((s) => s.key === r.size)?.label ?? r.size}</th>
                          {r.inch.map((v, i) => (
                            <td key={i}>{v === null ? '—' : c.num(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
            {trial ? (
              <p className="trial-ln lp-trial" data-testid="lp-trial">
                {trial}
              </p>
            ) : null}
          </section>
        ) : null}
        {reviews ? (
          <section className="lp-s" data-part="reviews">
            <PdpReviews c={c} set={revSet} data={reviews} name={m.name} qa={false} />
          </section>
        ) : null}
        {cells.length ? (
          <section className="lp-s" data-part="faq">
            <h2 className="h2 mb12">{w('faq')}</h2>
            <PdpRules cells={cells} heads={{ delivery: t('pdp.rules.delivery'), exchange: t('pdp.rules.exchange'), returns: t('pdp.rules.returns') }} hide={t('pdp.rules.hide')} trial={null} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
