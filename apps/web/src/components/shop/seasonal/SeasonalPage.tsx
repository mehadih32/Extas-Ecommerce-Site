// S12 · PR 246 (Blueprint answer 15, C12 "seasonal /collections/<slug>", demo 73-blog.js "Occasions & seasons") — a
// permanent seasonal page (Eid, winter, Puja or an occasion the owner adds), served at /collections/<slug> while
// `marketing.seasonal` is on and no category has that link. Its parts come in their fixed order, each one the owner
// switched on: the headline with his line and intro, the shop's Eid order-by line (Rules › Eid, PR 214, only for the
// occasions he lists and only while that rule says something), the countdown, the seasonal collection's products
// (PR 32, their own live prices), his reasons and the newest live journal guides of the category he picked (only while
// the journal is on). A page that was live once and is now taken down answers with its resting page: it comes back
// for its occasion (PR 527: a link that was live never answers "not found").
import { getPrisma } from '@extas/db/client';
import { storefrontEid } from '@extas/rules';
import type { SeasonalSettings } from '@extas/settings';
import { heroCollectionCards } from '@/lib/shop/catalogue';
import { readPageSettings, type ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { settingsResolver } from '@/lib/settings';
import { occasionName, secondsLeft, showsCutoff, type SeasonalSection } from '@/lib/marketing/seasonal-model';
import type { ServedSeasonal } from '@/lib/marketing/seasonal';
import { CardDeskMount } from '../CardDeskMount';
import { ProductCard } from '../ProductCard';
import { LandingTimer } from '../landing/LandingTimer';
import './seasonal.css';

/** The Eid order-by lines for the page (none when the rule says nothing now, or it cannot be read). */
async function cutoffLines(c: ShopContext): Promise<string[]> {
  const resolver = settingsResolver();
  if (!resolver) return [];
  try {
    return (await storefrontEid({ db: getPrisma(), settings: resolver }, c.storeId, { locale: c.lang })).banner ?? [];
  } catch {
    return [];
  }
}

/** The newest live journal articles of the category, in the page's language. */
async function guides(c: ShopContext, categoryId: string, take: number) {
  try {
    return await getPrisma().blogPost.findMany({
      where: { storeId: c.storeId, categoryId, locale: c.lang, status: 'PUBLISHED', archivedAt: null },
      orderBy: { publishedAt: 'desc' },
      take,
      select: { slug: true, title: true, excerpt: true },
    });
  } catch {
    return [];
  }
}

export async function SeasonalPage({ c, served, set }: { c: ShopContext; served: ServedSeasonal; set: SeasonalSettings }) {
  const t = c.t;
  const lang = c.lang;
  const p = served.page;
  const title = (lang === 'bn' && p.titleBn) || p.titleEn;
  const intro = (lang === 'bn' && p.introBn) || p.introEn;
  const occasion = occasionName(set.occasions, p.occasion, lang);

  if (served.serve === 'resting') {
    return (
      <div className="container sn-wrap" data-testid="seasonal" data-state="resting" data-page={p.slug}>
        <section className="sn-hero">
          <p className="sn-occ">{occasion}</p>
          <h1 className="sn-title">{t('seasonal.restingTitle', { name: title })}</h1>
          <p className="sn-intro">{t('seasonal.restingLine', { occasion })}</p>
          <div className="sn-acts">
            <a className="btn primary sn-btn" href={hrefIn(lang, ROUTES.newIn)}>
              {t('seasonal.seeNew')}
            </a>
            <a className="btn sn-btn" href={hrefIn(lang, ROUTES.home)}>
              {t('seasonal.home')}
            </a>
          </div>
        </section>
      </div>
    );
  }

  const on = (k: SeasonalSection['key']) => p.sections.find((s) => s.key === k && s.on) ?? null;
  const hero = on('hero');
  const offer = hero?.config.offer ? (lang === 'bn' && hero.config.offer.bn) || hero.config.offer.en : null;
  const timer = on('timer');
  const endsAt = timer?.config.endsAt && secondsLeft(timer.config.endsAt, new Date()) ? timer.config.endsAt : null;
  const reasons = (on('reasons')?.config.lines ?? []).map((l) => (lang === 'bn' && l.bn) || l.en).filter(Boolean);
  const colId = on('products')?.config.collectionId ?? null;
  const catId = on('articles')?.config.categoryId ?? null;
  const journalOn = (await readPageSettings(['blog.journal'] as const, c.storeId))['blog.journal'].on;
  const col = colId ? await getPrisma().collection.findFirst({ where: { id: colId, storeId: c.storeId }, select: { slug: true } }).catch(() => null) : null;
  const [lines, cards, posts] = await Promise.all([
    on('cutoff') && showsCutoff(set, p.occasion) ? cutoffLines(c) : Promise.resolve([]),
    col ? heroCollectionCards(c.storeId, col.slug, set.productsMax, false) : Promise.resolve(null),
    catId && journalOn ? guides(c, catId, set.articlesMax) : Promise.resolve([]),
  ]);
  const digits = Array.from({ length: 10 }, (_, i) => c.num(i));

  return (
    <div className="container sn-wrap" data-testid="seasonal" data-state="live" data-page={p.slug}>
      <section className="sn-hero" data-part="hero">
        {occasion ? <p className="sn-occ">{occasion}</p> : null}
        <h1 className="sn-title">{title}</h1>
        {hero && offer ? <p className="sn-offer">{offer}</p> : null}
        {hero && intro ? <p className="sn-intro">{intro}</p> : null}
      </section>
      {lines.length ? (
        <section className="sn-s card sn-cut" data-part="cutoff">
          <h2 className="h3">{t('seasonal.orderBy')}</h2>
          {lines.map((l, i) => (
            <p key={i} className="sn-cl">
              {l}
            </p>
          ))}
        </section>
      ) : null}
      {endsAt ? (
        <section className="sn-s" data-part="timer">
          <LandingTimer endsAt={endsAt} label={t('seasonal.timer')} units={{ d: t('landing.units.d'), h: t('landing.units.h'), m: t('landing.units.m'), s: t('landing.units.s') }} num={digits} />
        </section>
      ) : null}
      {colId ? (
        <section className="sn-s" data-part="products">
          <h2 className="h2 mb12">{t('seasonal.products')}</h2>
          {cards?.length ? (
            <div className="grid g4" data-testid="seasonal-grid">
              {cards.map((card, i) => (
                <ProductCard key={card.id} card={card} c={c} priority={i < 2} />
              ))}
            </div>
          ) : (
            <p className="sn-none">
              {t('seasonal.productsNone')}{' '}
              <a className="sn-lnk" href={hrefIn(lang, ROUTES.newIn)}>
                {t('seasonal.seeNew')}
              </a>
            </p>
          )}
        </section>
      ) : null}
      {reasons.length ? (
        <section className="sn-s" data-part="reasons">
          <h2 className="h2 mb12">{t('seasonal.reasons')}</h2>
          <ul className="sn-ben">
            {reasons.map((r, i) => (
              <li key={i} className="card">
                {r}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {posts.length ? (
        <section className="sn-s" data-part="articles">
          <h2 className="h2 mb12">{t('seasonal.articles')}</h2>
          <ul className="sn-posts">
            {posts.map((a) => (
              <li key={a.slug} className="card sn-post">
                <a className="sn-pl" href={hrefIn(lang, ROUTES.article(a.slug))}>
                  <b>{a.title}</b>
                  {a.excerpt ? <span className="sn-ex">{a.excerpt}</span> : null}
                  <span className="sn-more">{t('seasonal.readMore')}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {cards?.length ? <CardDeskMount c={c} /> : null}
    </div>
  );
}
