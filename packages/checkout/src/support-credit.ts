// S22 · PR 429 (Blueprint B4.6: "the r= reference is the whole trick") — an order placed from a product link sent in a
// support chat is credited to that chat and to the employee who sent it. The shop's product page kept the link's
// reference in the browser (lib/shop/support-ref.ts, only while `support.catalogue` is on); here, inside the order's own
// transaction, the reference is checked again — this store's, opened (its first click noted), within `creditDays` of
// that click and not credited to an order yet — and then names the order (`Order.supportRefCode`), the share names the
// order (`SupportProductShare.orderId`) and the chat's log says so. One share credits one order. An unknown, old or
// spent reference is ignored. Nothing here changes a price, a discount, COD, the order's total or its source: a
// website order stays a website order (B4.6: "website and ad-driven orders keep their normal analytics").
import type { CheckoutDeps, Tx } from './context';
import { setting } from './context';

const DAY_MS = 86_400_000;
/** A reference as the shop accepts it (the same shape as @extas/support REF_CODE). */
const REF = /^[a-z0-9]{8,24}$/;

/** The share a reference may credit, or null (checked before the order is made; the claim follows in the same tx). */
export async function supportShareFor(deps: Pick<CheckoutDeps, 'settings'>, tx: Tx, storeId: number, ref: string | null | undefined, now: Date): Promise<{ id: string; refCode: string; conversationId: string } | null> {
  if (!ref || !REF.test(ref)) return null;
  const cat = await setting(deps, storeId, 'support.catalogue');
  if (!cat.enabled) return null;
  const s = await tx.supportProductShare.findUnique({ where: { storeId_refCode: { storeId, refCode: ref } }, select: { id: true, refCode: true, conversationId: true, clickedAt: true, orderId: true } });
  if (!s || s.orderId || !s.clickedAt) return null;
  if (now.getTime() - s.clickedAt.getTime() > cat.creditDays * DAY_MS) return null;
  return { id: s.id, refCode: s.refCode, conversationId: s.conversationId };
}

/** Claims the share for the order (one order per share, even with two checkouts at once); true when it was credited. */
export async function creditSupportShare(tx: Tx, storeId: number, share: { id: string; refCode: string; conversationId: string }, order: { id: string; number: string }, now: Date): Promise<boolean> {
  const claimed = await tx.supportProductShare.updateMany({ where: { id: share.id, storeId, orderId: null }, data: { orderId: order.id } });
  if (claimed.count !== 1) return false;
  await tx.order.update({ where: { id: order.id }, data: { supportRefCode: share.refCode } });
  await tx.conversationEvent.create({ data: { storeId, conversationId: share.conversationId, kind: 'PRODUCT_ORDERED', actorType: 'CUSTOMER', data: { ref: share.refCode, orderId: order.id, number: order.number }, createdAt: now } });
  return true;
}
