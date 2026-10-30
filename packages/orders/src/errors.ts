// One error type for every refusal of the order service. The `code` is stable; the admin and the shop turn it into
// words from their messages files. `data` carries what the screen needs with the refusal: the commands open now after
// ILLEGAL_TRANSITION, the fresh order after STALE (§7.1).
import type { RefusalCode } from './pure';

export type OrdersErrorCode =
  | RefusalCode
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  /** The order changed since the screen read it (`data.order` is the fresh one). */
  | 'STALE'
  /** The same idempotency key was sent with a different request. */
  | 'IDEMPOTENCY_MISMATCH'
  /** A reason code that is not on the owner's list, or a note that the reason needs. */
  | 'REASON_REQUIRED'
  /** The customer may not cancel this order himself (the owner's cut-off, or it is not his). */
  | 'CANCEL_NOT_ALLOWED'
  /** Two orders that cannot be put in one parcel (one is booked, finished or of another customer). */
  | 'NOT_MERGEABLE'
  /** PR 127: the customer's add-on window is closed (`data.closed` says why). */
  | 'ADD_ON_CLOSED'
  /** PR 127: no more lines or pieces may be added (the owner's limits), or this piece is already added. */
  | 'ADD_ON_LIMIT'
  /** PR 127: only a line added after placing is taken out this way. */
  | 'ADD_ON_ONLY'
  /** PR 127: lines are added to Cash on Delivery orders only (a prepaid order's extra amount needs a payment, S07). */
  | 'NOT_COD'
  /** PR 127: the piece is not on sale (unpublished, archived or without a price). */
  | 'NOT_SELLABLE'
  /** PR 127: not enough free pieces on the shared pool. */
  | 'OUT_OF_STOCK'
  /** PR 127: the delivery band's Cash on Delivery limit would be passed. */
  | 'COD_LIMIT'
  /** PR 142: the edit changes nothing (every field is as stored). */
  | 'NOTHING_CHANGED'
  /** PR 142: the phone is not a Bangladeshi mobile number (`data.reason`: empty, prefix, length). */
  | 'BAD_PHONE'
  /** PR 142: a size is changed only to another size (or colour) of the same piece. */
  | 'NOT_SAME_PIECE'
  /** PR 142: the other size costs another price now; a price is never changed by an edit. */
  | 'PRICE_DIFFERS'
  /** PR 142: the piece is in a set or the order has an offer, so taking it out would change a price or a discount. */
  | 'OFFER_ON_ORDER'
  /** PR 142: the order's last piece is never taken out; cancel the order instead. */
  | 'LAST_LINE'
  /** PR 143: the customer's edit window is closed (`data.closed` says why: OFF, STEP, TIME, CAP, BOOKED, CANCEL). */
  | 'EDIT_CLOSED'
  /** PR 151: more orders than one export file holds (`data.count`, `data.maxRows`); narrow the filter. */
  | 'EXPORT_TOO_LARGE'
  /** PR 156: "score again" while the owner has the risk score switched off (`risk.score`). */
  | 'RISK_OFF'
  /** PR 542: an advance of the delivery charge for an order that has none. */
  | 'NO_CHARGE'
  /** PR 542: a part of the amount asked while the owner has not set its percent (`risk.levels.partialPercent`). */
  | 'PARTIAL_UNSET'
  /** PR 542: nothing is left to pay on this order, so there is no advance to ask. */
  | 'NOTHING_DUE'
  /** PR 542: no way to reach the customer was picked (SMS, WhatsApp or a call). */
  | 'NO_CHANNEL'
  /** PR 185: no exchange now — the policy is off, the window has passed or the delivered mark is missing (`data.why`). */
  | 'EXCHANGE_CLOSED'
  /** PR 185: this piece may not be exchanged (an excluded category, a reason the policy does not take) (`data.why`). */
  | 'NOT_EXCHANGEABLE'
  /** PR 185: the piece's exchanges are used up (`policy.exchange.perItem` or the rule), or one is already open. */
  | 'EXCHANGE_LIMIT'
  /** PR 185 (B1.8): the piece chosen is not among the ones offered (the tiers are strictly in order). */
  | 'NOT_OFFERED'
  /** PR 185: our mistake needs a photo here (`orders.exchange.engine.ourMistakePhoto`). */
  | 'PHOTO_REQUIRED'
  /** PR 185: the exchange is not in a state for this step (`data.status`). */
  | 'EXCHANGE_STATE'
  /** PR 187: the return is not in a state for this step (`data.status`). */
  | 'RETURN_STATE'
  /** PR 187 (SIM-F-022): the SKU scanned is not the one expected (`data.expected`, `data.scanned`); accept it with a note. */
  | 'SKU_MISMATCH'
  /** PR 187: the SKU scanned is not a piece of this shop. */
  | 'UNKNOWN_SKU'
  /** PR 187: every piece of the parcel is checked in one save, each once (`details`: the pieces missing or twice). */
  | 'QC_INCOMPLETE'
  /** PR 187: a piece that is not sellable needs its reason (and a photo when `orders.returns.qc.photoForLoss`). */
  | 'LOSS_REASON_REQUIRED'
  /** PR 189: no return after receipt now — the policy (no returns after receipt), the window, or the parcel is not with
   * the customer (`data.why`: POLICY, WINDOW, UNKNOWN, NOT_DELIVERED). */
  | 'RETURN_CLOSED'
  /** PR 189: these pieces are already coming back (another return or an open exchange) (`data.left`). */
  | 'RETURN_LIMIT'
  /** PR 407: the owner has the invoice switched off (`account.invoice.enabled`), so there is none to print. */
  | 'INVOICE_OFF'
  /** PR 612–614 (CN-028): an old shop-side path that never runs while the store speaks ERP contract v6 (the owner
   * decides every returned piece in the ERP; no refunds after delivery), or a v6 step on a store still on v5
   * (`data.model`). */
  | 'ERP_MODEL'
  /** PR 612–614: an old shop-side path its switch has turned off (`data.setting`: `returns.legacy.*`). */
  | 'LEGACY_OFF'
  /** PR 612–614: the store's ERP refused the call (`data.erpCode`: NOT_OUR_ORDER, LINE_NOT_DELIVERED, EXCHANGE_OPEN, …). */
  | 'ERP_REFUSED'
  /** PR 612–614: the store's ERP cannot be reached now, or is not set up (`data.reason`); nothing was changed. */
  | 'ERP_UNAVAILABLE'
  /** PR 614: not enough of the new piece is free in the ERP now; regular orders come first, so the exchange waits
   * (`data.shortSkus`). */
  | 'EXCHANGE_WAITING'
  /** PR 612: the return list is not in a state for this step (`data.status`). */
  | 'HANDBACK_STATE'
  /** PR 612: the parcel is not expected back (`data.why`: NO_RETURN_OPEN, ALREADY_ON_LIST, NOT_FOUND); take it with a note. */
  | 'NOT_EXPECTED'
  /** PR 612, 614: the order was never sent to the store's ERP on contract v6 (`data.orderNumber`). */
  | 'NOT_IN_ERP';

export class OrdersError extends Error {
  readonly code: OrdersErrorCode;
  readonly details: string[];
  readonly data: Record<string, unknown> | undefined;

  constructor(code: OrdersErrorCode, message: string, details: string[] = [], data?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = 'OrdersError';
    this.code = code;
    this.details = details;
    this.data = data;
  }

  /** HTTP status for the APIs (§7.1: 400 validation, 404, 409 ILLEGAL_TRANSITION / STALE / DUPLICATE, 422 business rule). */
  get status(): number {
    switch (this.code) {
      case 'INVALID_INPUT':
      case 'REASON_REQUIRED':
        return 400;
      case 'NOT_FOUND':
        return 404;
      case 'CANCEL_NOT_ALLOWED':
      case 'ADVANCE_SHORT':
      case 'NOT_MERGEABLE':
      case 'ADD_ON_CLOSED':
      case 'ADD_ON_LIMIT':
      case 'ADD_ON_ONLY':
      case 'NOT_COD':
      case 'NOT_SELLABLE':
      case 'OUT_OF_STOCK':
      case 'COD_LIMIT':
      case 'BAD_PHONE':
      case 'NOT_SAME_PIECE':
      case 'PRICE_DIFFERS':
      case 'OFFER_ON_ORDER':
      case 'LAST_LINE':
      case 'EDIT_CLOSED':
      case 'EXPORT_TOO_LARGE':
      case 'NO_CHARGE':
      case 'PARTIAL_UNSET':
      case 'NOTHING_DUE':
      case 'NO_CHANNEL':
      case 'RISK_OFF':
      case 'EXCHANGE_CLOSED':
      case 'NOT_EXCHANGEABLE':
      case 'EXCHANGE_LIMIT':
      case 'NOT_OFFERED':
      case 'PHOTO_REQUIRED':
      case 'SKU_MISMATCH':
      case 'UNKNOWN_SKU':
      case 'QC_INCOMPLETE':
      case 'LOSS_REASON_REQUIRED':
      case 'RETURN_CLOSED':
      case 'INVOICE_OFF':
      case 'RETURN_LIMIT':
      case 'ERP_MODEL':
      case 'LEGACY_OFF':
      case 'ERP_REFUSED':
      case 'EXCHANGE_WAITING':
      case 'NOT_EXPECTED':
      case 'NOT_IN_ERP':
        return 422;
      case 'ERP_UNAVAILABLE':
        return 503;
      default:
        return 409;
    }
  }
}

export const isOrdersError = (e: unknown): e is OrdersError => e instanceof OrdersError;
