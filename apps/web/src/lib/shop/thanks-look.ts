// PR 128 — "Complete your look" on the thank-you page, read on the server: while the owner has it on (`thanks.look`),
// the pieces his order's products are paired with in the shop's running combos (@extas/combos lookFor — nothing
// invented), each with its sellable colours and sizes and the price its product page shows now (@extas/rules, the
// same price "Add to this parcel" charges), plus every piece he already added. Whether Add shows comes from the
// order's own add-on window (@extas/orders addOnState, `orders.addOn`). Without a database, or when it is slow or
// anything fails, the page simply has no block. On a test server a browser that asked for it (POST /api/shop/try-look)
// sees the block as if both switches were on, so the gates measure it (nothing is written to the settings).
import { lookFor } from '@extas/combos';
import type { Receipt } from '@extas/checkout';
import { getPrisma } from '@extas/db/client';
import { sellableUnits } from '@extas/inventory';
import { addOnState, type AddOnState, type OrdersDeps } from '@extas/orders';
import type { AddOnSettings, Key, Value } from '@extas/settings';
import { liveDiscountFor } from '../rules-public';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { visitorId } from './bag';
import { readPageSettings } from './context';
import { lookRows, lookShown, type LookProduct, type LookRow } from './thanks-look-model';
import { tryLookOn } from './try-look';

export interface LookSize {
  key: string;
  label: string;
}

export interface LookData {
  state: AddOnState;
  until: AddOnSettings['until'];
  rows: LookRow[];
  products: Map<string, LookProduct & { sizes: LookSize[] }>;
}

/** The block's data for this order, or null: off, nothing honest to show, or the window shut with nothing added. */
export async function thanksLook(storeId: number, r: Receipt): Promise<LookData | null> {
  const resolver = settingsResolver();
  if (!resolver) return null;
  const [s, trial] = await Promise.all([readPageSettings(['thanks.look', 'orders.addOn', 'inventory.sellableLocationKinds'], storeId), tryLookOn()]);
  if (!s['thanks.look'].enabled && !trial) return null;
  const settings: OrdersDeps['settings'] = trial
    ? {
        async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
          const v = await resolver.value(key, opts);
          return (key === 'orders.addOn' ? { ...(v as AddOnSettings), enabled: true } : v) as Value<K>;
        },
      }
    : resolver;
  try {
    return await withTimeout(read(storeId, r, settings, s['thanks.look'].max, s['orders.addOn'].until, s['inventory.sellableLocationKinds']), settingsTimeoutMs() * 4);
  } catch (e) {
    console.warn(`shop: complete your look unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

async function read(storeId: number, r: Receipt, settings: OrdersDeps['settings'], max: number, until: AddOnSettings['until'], kinds: Value<'inventory.sellableLocationKinds'>): Promise<LookData | null> {
  const db = getPrisma();
  const visitor = await visitorId();
  const state = await addOnState({ db, settings }, { storeId, customerId: null, visitorId: visitor }, r.number);
  const added = r.lines.filter((l) => l.isAddOn).map((l) => ({ id: l.id, productId: l.productId }));
  if (!state.open && !added.length) return null;
  const own = [...new Set(r.lines.filter((l) => !l.isAddOn && l.productId).map((l) => l.productId!))];
  const suggested = await lookFor({ db }, { storeId, productIds: own, max });
  const ids = [...new Set([...suggested, ...added.flatMap((l) => (l.productId ? [l.productId] : []))])];
  if (!ids.length) return null;
  const rows = await db.productVariant.findMany({
    where: { storeId, productId: { in: ids }, archivedAt: null, active: true, priceMinor: { not: null } },
    orderBy: [{ size: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    select: {
      id: true,
      productId: true,
      inStock: true,
      priceMinor: true,
      colour: { select: { key: true } },
      size: { select: { key: true, label: true } },
      stockLevels: { select: { available: true, cartReserved: true, onHand: true, location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } } } },
    },
  });
  const kindSet = new Set(kinds);
  // the product page's price for each distinct price of a product (one engine call per price, not per variant)
  const price = new Map<string, number>();
  for (const v of rows) {
    const k = `${v.productId}:${v.priceMinor}`;
    if (price.has(k)) continue;
    const d = await liveDiscountFor({ storeId, variantId: v.id });
    price.set(k, d?.discountedMinor ?? v.priceMinor!);
  }
  const products = new Map<string, LookProduct & { sizes: LookSize[] }>();
  for (const id of ids) {
    const mine = rows.filter((v) => v.productId === id);
    const sizes: LookSize[] = [];
    for (const v of mine) if (v.size && !sizes.some((x) => x.key === v.size!.key)) sizes.push({ key: v.size.key, label: v.size.label });
    products.set(id, {
      id,
      sizes,
      variants: mine.map((v) => ({
        id: v.id,
        colour: v.colour?.key ?? null,
        size: v.size?.key ?? null,
        stock: v.inStock ? sellableUnits(v.stockLevels, kindSet) : 0,
        payMinor: price.get(`${v.productId}:${v.priceMinor}`)!,
      })),
    });
  }
  const look = lookRows({ suggested, added, products });
  return lookShown(look, state.open) ? { state, until, rows: look, products } : null;
}
