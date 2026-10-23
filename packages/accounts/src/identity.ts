// PR 129 — the account made with the first order (Blueprint D3.13/D3.15; demo 52-thanks.js ty_account). The phone number
// a customer orders with is his account: the first order makes the customer row (one per store and number, shared with
// Messenger, WhatsApp and phone orders), every later order with the same number joins it, and an order placed while
// signed in belongs to the signed-in customer.
//
// SIM-F-039 (CN-017, required acceptance test): the account never gets a password. The demo made the phone number the
// password and signed the browser in, so anyone who knew a number could open that customer's orders and address. Here a
// new account has no credential at all: the first sign-in is by a one-time SMS code to that number (PR 130), and a
// password is something the customer may set afterwards. Placing an order never signs the browser in either — typing
// someone else's number at the checkout must not open his account; the placing browser still sees its own order
// (the thank-you and order pages read the bag cookie's visitor id).
import type { Tx } from './context';

/** How the order found its account. */
export type OrderAccountKind = 'created' | 'existing' | 'signedIn';

export interface OrderAccount {
  customerId: string;
  kind: OrderAccountKind;
}

export interface LinkOrderInput {
  storeId: number;
  /** The phone the order is placed with, normalised (+8801…). */
  phone: string;
  /** The name typed at the checkout (the new account's name; an existing account keeps its own). */
  name: string;
  placedAt: Date;
  /** The signed-in customer (PR 130), or null for a guest. */
  signedInCustomerId: string | null;
  /** `account.autoCreate.enabled`: off = a guest's order stays without an account. */
  autoCreate: boolean;
}

/**
 * The account an order belongs to, inside the order's own transaction: the signed-in customer, else the customer with
 * the order's phone number, else a new customer made now (no credential, SIM-F-039). Null only for a guest while the
 * owner has switched the automatic account off. The customer's order count and last order time move with it.
 */
export async function linkOrderAccount(tx: Tx, input: LinkOrderInput): Promise<OrderAccount | null> {
  const { storeId, placedAt } = input;
  const bump = { orderCount: { increment: 1 }, lastOrderAt: placedAt };
  if (input.signedInCustomerId) {
    const r = await tx.customer.updateMany({ where: { id: input.signedInCustomerId, storeId }, data: bump });
    if (r.count === 1) return { customerId: input.signedInCustomerId, kind: 'signedIn' };
  }
  if (!input.autoCreate) return null;
  // One customer per number: two orders with the same new number at the same moment make one account, not two.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer:${storeId}:${input.phone}`}, 0))`;
  const known = await tx.customer.findUnique({ where: { storeId_phone: { storeId, phone: input.phone } }, select: { id: true } });
  if (known) {
    await tx.customer.update({ where: { id: known.id }, data: bump });
    return { customerId: known.id, kind: 'existing' };
  }
  const name = input.name.trim() || null;
  const made = await tx.customer.create({
    data: { storeId, phone: input.phone, name, firstSource: 'WEBSITE', orderCount: 1, lastOrderAt: placedAt, createdAt: placedAt },
    select: { id: true },
  });
  return { customerId: made.id, kind: 'created' };
}
