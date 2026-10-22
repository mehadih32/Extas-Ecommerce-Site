// PR 43 — the hero's pictures (§57.1, demo 20-home.js HERO_SLIDES / hm_pin): 12–15 products across all categories,
// taken in turns so every category shows (or a live campaign collection's own products, CN-012). Each picture is the
// product's photo in that colour, or its drawing in the colour's hex until the photo is uploaded, and opens the
// product on that colour. The pin is one row on a phone — name | price (| the struck price, only by the PR 38
// honesty rule) — and two lines on a desktop; it widens for a long name and the name steps down, never cut (the fit
// rule HERO_PIN_FIT). With no priced product there are no pictures and the hero is its text alone.
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { colourName, photoFor, productName } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { drawingBackground } from '@/lib/shop/garment-art';
import { productColourPath, type HeroPick } from '@/lib/shop/home-model';
import { hrefIn } from '@/lib/shop/lang';
import { GarmentDrawing } from '../ProductPicture';
import { HeroSlider } from './HeroSlider';

/** How many pictures load at once (the first screen: two on a phone, three on a desktop). */
const EAGER = 3;

export function HomeHeroSlides({ c, picks }: { c: ShopContext; picks: readonly HeroPick[] }) {
  if (!picks.length) return null;
  const set = c.s['home.heroSlides'];
  const prefix = c.s['naming.productPathPrefix'];
  return (
    <HeroSlider
      engine={c.s['slider.engine']}
      speed={set.speed}
      stepMs={set.stepMs}
      prevLabel={c.t('home.slides.prev')}
      nextLabel={c.t('home.slides.next')}
      phoneArrows={set.phoneArrows}
    >
      {picks.map(({ card, colour }, i) => {
        const name = productName(card, c.lang);
        const price = c.money(card.priceMinor ?? 0);
        const was = card.wasMinor != null && card.wasMinor > (card.priceMinor ?? 0) ? c.money(card.wasMinor) : null;
        const hex = colour?.hex ?? '';
        const photo = photoFor(card, colour?.key);
        const cName = colour ? colourName(colour, c.lang) : '';
        const label = cName ? c.t('home.slides.label', { name, colour: cName, price }) : c.t('card.label', { name, price });
        return (
          <a
            key={`${card.id}:${colour?.key ?? ''}`}
            className={photo ? 'hm-sl has-photo' : 'hm-sl'}
            href={hrefIn(c.lang, productColourPath(prefix, card.slug, colour?.key))}
            style={{ background: drawingBackground(hex) }}
            aria-label={label}
          >
            {photo ? (
              <ResponsiveImage image={photo} slot="card" sizes="(max-width: 1023px) 50vw, 280px" alt={altFor(photo, c.lang, name)} priority={i < EAGER} />
            ) : (
              <GarmentDrawing garment={card.garment} hex={hex} />
            )}
            <span className="hm-pin" aria-hidden="true">
              <b className="hm-pin-n">{name}</b>
              <i className="hm-pin-bar" />
              <span className="hm-pin-p">{price}</span>
              {was ? <s className="hm-pin-o">{was}</s> : null}
            </span>
          </a>
        );
      })}
    </HeroSlider>
  );
}
