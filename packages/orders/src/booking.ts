// S05 · PR 541 (SIM-F-014, F-002) — booking a courier goes through the one order service. S08's courier screens (the
// order page, Delivery › Ready to book, "Book all", the bulk bar) call `bookWith` with the function that writes the
// shipment: it runs under the order's row lock only when the machine allows `book` (pure.ts) — a confirmed order, not
// yet handed over, no cancel asked or pending, not booked already, and NO OPEN REVIEW (a duplicate or a risk section
// waiting for a person). Every screen's "ready to book" list is the order service's own `readyToBook` view (list.ts),
// the same rule as a filter, so a screen never offers what the service would refuse.
import type { OrdersDeps, Tx } from './context';
import { execute, type By, type CommandOptions, type CommandResult, type LockedOrder } from './service';

/** What S08's booking hands back: the shipment it wrote (and what the timeline should say about it). */
export interface Booked {
  shipmentId: string;
  data?: Record<string, unknown>;
}

/**
 * Books a courier for one order: `create` writes the shipment in the command's transaction, after the machine said
 * yes; a refusal (IN_REVIEW, CANCEL_REQUESTED, CANCEL_PENDING, BOOKED, ILLEGAL_TRANSITION) writes nothing.
 */
export async function bookWith(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By, create: (tx: Tx, o: LockedOrder) => Promise<Booked>, opts: CommandOptions = {}): Promise<CommandResult> {
  return execute(
    deps,
    ref,
    by,
    {
      command: 'book',
      effect: async (tx, o) => {
        const b = await create(tx, o);
        return { eventData: { shipmentId: b.shipmentId, ...b.data } };
      },
    },
    opts,
  );
}
