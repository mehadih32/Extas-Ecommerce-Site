// Follow-up 112 (PR 56 · 58) — "Your size" from the signed-in customer's own orders, not only this browser. While
// `pdp.usualSize` is on and he is signed in, the product page reads the sizes on his newest order lines (tops and
// bottoms apart, as the browser keeps them), within the same `days`; a draft, a cancelled or a returned order and a removed
// line do not count. The browser's own kept size and his orders are joined by date (the newer
// wins), so a size he put in the bag on another phone shows here too. A kept Find My Size answer still wins over both
// (PdpSizes). Nothing is written: the account side is read from his orders as they are. Server only.
import { getPrisma } from '@extas/db/client';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { sizeGroupOf, type SizeGroup } from './usual-size';

const DAY_MS = 86_400_000;

/** One order line as read for this: its size key, the garment type of its product, when it was ordered. */
export interface SizedLine {
  size: string | null;
  garment: string | null;
  at: Date;
}

/** The kept-size store (the browser's format, usual-size.ts) from his order lines, newest first; null: none. */
export function usualFromLines(lines: readonly SizedLine[], diagramFor: Readonly<Record<string, string>>, days: number, now: number): string | null {
  const out: Partial<Record<SizeGroup, { size: string; at: number }>> = {};
  for (const l of lines) {
    if (!l.size || !/^[a-z0-9-]{1,24}$/.test(l.size)) continue;
    const at = l.at.getTime();
    if (now - at > days * DAY_MS) continue;
    const g = sizeGroupOf(l.garment, diagramFor);
    if (!out[g] || out[g]!.at < at) out[g] = { size: l.size, at };
  }
  return out.top || out.bottom ? JSON.stringify(out) : null;
}

/** His order lines that say a size he keeps (newest first, a bounded read). */
export async function accountUsual(storeId: number, customerId: string, diagramFor: Readonly<Record<string, string>>, days: number, now = Date.now()): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  const prisma = getPrisma();
  try {
    const rows = await withTimeout(
      prisma.orderItem.findMany({
        where: {
          storeId,
          status: 'ACTIVE',
          variantId: { not: null },
          createdAt: { gte: new Date(now - days * DAY_MS) },
          order: { customerId, status: { notIn: ['DRAFT', 'CANCELLED', 'RETURNED'] } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { createdAt: true, variantId: true },
      }),
      settingsTimeoutMs(),
    );
    if (!rows.length) return null;
    const vids = rows.flatMap((r) => (r.variantId ? [r.variantId] : []));
    const variants = await withTimeout(
      prisma.productVariant.findMany({
        where: { storeId, id: { in: vids } },
        select: { id: true, size: { select: { key: true } }, product: { select: { category: { select: { garmentType: { select: { key: true } } } } } } },
      }),
      settingsTimeoutMs(),
    );
    const byId = new Map(variants.map((v) => [v.id, v]));
    return usualFromLines(
      rows.map((r) => {
        const v = r.variantId ? byId.get(r.variantId) : undefined;
        return { size: v?.size?.key ?? null, garment: v?.product.category?.garmentType?.key ?? null, at: r.createdAt };
      }),
      diagramFor,
      days,
      now,
    );
  } catch (e) {
    console.warn(`shop: the account's usual size is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}
