// PR 71 — the wishlist, at /account/wishlist and /bn/account/wishlist (the store shell around it; noindex: a list is
// nobody's search result). The rest of /account stays "coming soon" until the customer accounts are built.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { WishlistPage } from '@/components/shop/wish/WishlistPage';
import { signedIn } from '@/lib/shop/account';
import { cartDeps } from '@/lib/shop/bag';
import { BAG_COOKIE } from '@/lib/shop/bag-model';
import { liveCardsByIds, newestCards } from '@/lib/shop/catalogue';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';
import { visitorOf, wishDetails, wishRows, type WishDetail } from '@/lib/shop/wishlist';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'wishlist', c.t('wish.title'))), robots: { index: false, follow: true } };
}

export default async function Wishlist() {
  const c = await shopContext();
  const s = await readPageSettings(['wish.list', 'pdp.size'] as const, c.storeId);
  const visitor = visitorOf((await cookies()).get(BAG_COOKIE)?.value);
  const me = await signedIn();
  const deps = cartDeps();
  let rows: Awaited<ReturnType<typeof wishRows>> = [];
  let details = new Map<string, WishDetail>();
  if ((visitor || me) && deps) {
    const d = { db: deps.db, settings: deps.settings, storeId: c.storeId };
    try {
      // follow-up 71: signed in, the account's list (every device) with this browser's own hearts
      rows = await wishRows(d, visitor ?? '', me?.customer.id ?? null);
      details = await wishDetails(d, rows);
    } catch (e) {
      // the page still draws (empty) when the database is slow; the hearts keep their own copy
      console.warn(`shop: wishlist unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    }
  }
  const cards = await liveCardsByIds(
    c.storeId,
    rows.map((r) => r.productId),
  );
  const picks = !cards.length && s['wish.list'].emptyPicks > 0 ? await newestCards(c.storeId, s['wish.list'].emptyPicks, 'newest') : [];
  return <WishlistPage c={c} cards={cards} details={details} picks={picks} notifyBack={s['pdp.size'].notifyBack} />;
}
