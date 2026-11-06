// S02 · PR 596 — the side canvas on the shop (Website › Side canvas): the zones that show on this page today, with what
// each holds (a product's or a category's picture and link, an image, a small offer button). Nothing while the master
// switch is off (as shipped): the page's HTML stays exactly as before. The shop's client fitter (SideFit) places them.
import type { SideZone } from '@extas/settings';
import { categoryLeads, pickCards, type ShopCard } from './catalogue';
import type { ShopContext } from './context';
import { zoneLive } from './side-fit';

export interface SideItem {
  zone: SideZone;
  card: ShopCard | null;
  /** A category zone: its name. */
  title: string;
}

/** The zones of a page live today: the home page's, or a category page's (every category, or the chosen ones). */
export function zonesFor(zones: readonly SideZone[], page: 'home' | 'category', slug: string | null, today: string): SideZone[] {
  return zones.filter((z) => zoneLive(z, today) && (page === 'home' ? z.pages !== 'categories' : z.pages !== 'home' && (!z.cats.length || (slug !== null && z.cats.includes(slug)))));
}

/** What each zone holds; a product or category zone with nothing to show is left out. */
export async function sideItems(c: ShopContext, page: 'home' | 'category', slug: string | null): Promise<SideItem[]> {
  const set = c.s['layout.sideCanvas'];
  if (!set.enabled) return [];
  const zones = zonesFor(c.s['layout.sideZones'], page, slug, c.today);
  const out = await Promise.all(
    zones.map(async (zone): Promise<SideItem | null> => {
      if (zone.kind === 'product') {
        const [card] = await pickCards(c.storeId, { source: 'manual', cat: '', tag: '', ids: [zone.ref] }, 1);
        return card ? { zone, card, title: '' } : null;
      }
      if (zone.kind === 'category') {
        const cat = c.cats.find((k) => k.slug === zone.ref);
        const lead = cat ? (await categoryLeads(c.storeId, [cat.slug]))[cat.slug] : undefined;
        return cat && lead ? { zone, card: lead, title: (c.lang === 'bn' && cat.nameBn) || cat.nameEn } : null;
      }
      if (zone.kind === 'image') return zone.ref ? { zone, card: null, title: '' } : null;
      return zone.text.en || zone.text.bn ? { zone, card: null, title: '' } : null;
    }),
  );
  return out.filter((x): x is SideItem => x !== null);
}
