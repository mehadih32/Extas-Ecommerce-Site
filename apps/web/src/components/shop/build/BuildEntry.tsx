// Follow-up 242 (PR 100; demo 20-home diy row, 21-category cat-bn banner, 30-product "Build your own set" line) — the set
// builder's entries on other pages, each behind its own place in `combos.builder.places` (off as shipped) and only
// while the builder and its `entries` are on. The category banner and the product line show only where the builder
// really offers the product (builderOfferFor: the same rules, scope and categories as the builder page), and they link
// to that set group's own builder; the home row links to the builder. Every price is the set tier rule's own price
// (headline). Server only: no client script.
import { builderOffer, builderOfferFor } from '@extas/combos';
import type { PricedTier } from '@extas/combos/pure';
import { settingsTimeoutMs, withTimeout } from '@/lib/settings';
import { cartDeps } from '@/lib/shop/bag';
import { headline } from '@/lib/shop/build-model';
import { readPageSettings, type ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from '../Icon';
import '../combo/offer.css';
import './entry.css';

type Place = 'home' | 'category' | 'product';

interface Entry {
  href: string;
  tiers: PricedTier[];
}

/** The entry for one place, or null (its place off, the builder closed, nothing of these products in it). */
export async function buildEntryFor(c: ShopContext, place: Place, productIds: readonly string[] = []): Promise<Entry | null> {
  const set = await readPageSettings(['combos.builder.places'] as const, c.storeId);
  if (!set['combos.builder.places'][place]) return null;
  const deps = cartDeps();
  if (!deps) return null;
  try {
    if (place === 'home') {
      const b = await withTimeout(builderOffer(deps, c.storeId), settingsTimeoutMs() * 2);
      const tiers = b.groups[0]?.tiers;
      return b.open && tiers ? { href: hrefIn(c.lang, ROUTES.buildSet), tiers } : null;
    }
    const groups = await withTimeout(builderOfferFor(deps, c.storeId, productIds), settingsTimeoutMs() * 3);
    const g = groups[0];
    return g ? { href: hrefIn(c.lang, `${ROUTES.buildSet}/${encodeURIComponent(g.key)}`), tiers: g.tiers } : null;
  } catch (e) {
    console.warn(`shop: set builder entry unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

const head = (c: ShopContext, tiers: readonly PricedTier[]) => headline(tiers, (k, v) => c.t(`build.${k}`, v), c.money, c.num);

/** AUTO ADJUST (one line, never cut): every set size, stepping down on a narrow phone to the smallest set only. */
function Prices({ c, tiers }: { c: ShopContext; tiers: readonly PricedTier[] }) {
  const full = head(c, tiers);
  const short = tiers.length > 1 ? head(c, tiers.slice(0, 1)) : null;
  if (!short) return <span className="sm text2">{full}</span>;
  return (
    <span className="sm text2 bs-entry-p">
      <span className="bs-entry-pf">{full}</span>
      <span className="bs-entry-ps">{short}</span>
    </span>
  );
}

/** The home page's "Build your own set" row (demo 20-home diy). */
export function HomeBuildRow({ c, entry }: { c: ShopContext; entry: Entry | null }) {
  if (!entry) return null;
  return (
    <section className="container sec" data-testid="home-build">
      <a className="tint bs-entry bs-entry-home" href={entry.href}>
        <span className="ic">
          <Icon name="layers" size={20} />
        </span>
        <span className="grow">
          <span className="xs muted bold">{c.t('build.entry.eyebrow')}</span>
          <b className="bs-entry-t">{c.t('build.title')}</b>
          <Prices c={c} tiers={entry.tiers} />
          <span className="sm muted">{c.t('build.entry.homeText')}</span>
        </span>
        <span className="btn btn-primary btn-sm bs-entry-go">{c.t('build.entry.start')}</span>
        <span className="bs-entry-arr">
          <Icon name="right" size={16} />
        </span>
      </a>
    </section>
  );
}

/** The banner above a category page's products (demo 21-category cat-bn). */
export function CategoryBuildBanner({ c, entry }: { c: ShopContext; entry: Entry | null }) {
  if (!entry) return null;
  return (
    <a className="tint bs-entry bs-entry-cat" href={entry.href} data-testid="cat-build">
      <span className="ic">
        <Icon name="layers" size={18} />
      </span>
      <span className="grow">
        <span className="xs muted bold">{c.t('build.title')}</span>
        <Prices c={c} tiers={entry.tiers} />
      </span>
      <span className="sm bold bs-entry-go">{c.t('build.entry.start')}</span>
      <span className="bs-entry-arr">
        <Icon name="right" size={16} />
      </span>
    </a>
  );
}

/** One line on the product page (demo 30-product "Build your own set · Any 2 for ৳X"). */
export function PdpBuildLine({ c, entry }: { c: ShopContext; entry: Entry | null }) {
  if (!entry) return null;
  return (
    <div className="pdp-sec pdp-nudgesec" data-testid="pdp-build">
      <a className="tint pdp-nudge" href={entry.href}>
        <span className="ic">
          <Icon name="layers" size={17} />
        </span>
        <span className="grow">
          <b>{c.t('build.entry.line')}</b> · {head(c, entry.tiers)}
        </span>
        <Icon name="right" size={16} />
      </a>
    </div>
  );
}
