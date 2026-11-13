// S28 · PR 670 (CN-048, admin prototype v5, GAP-MAP C-01..C-15) — registry version 310. Couriers section: the default
// courier (`delivery.couriers.defaultCourierId`; empty text = Steadfast when it is in the list, else the first courier) — the courier a booking offers
// first and Courier 360 / the Couriers overview list first. Wave 2 adds its other settings to this file (671 payouts, 673
// claims, 674 messages), each with its own version; every number or switch here is off or empty as shipped.
// Labels: messages/couriers-v5.<lang>.json.
import { z } from 'zod';
import { setting } from './define';
import { templateTextSchema } from './schemas';

const V670 = 310;
const V671 = 311;
const V673 = 312;
const V674 = 313;

export const couriersSchema = z.object({ defaultCourierId: z.union([z.uuid(), z.literal('')]) }).strict();
export type CouriersSettings = z.output<typeof couriersSchema>;

/** PR 671: payouts asked of a courier through its own payment-request feature. Off as shipped; every number is the owner's. */
export const courierPayoutsSchema = z
  .object({
    enabled: z.boolean(),
    /** How often an open request is asked about again (minutes). */
    pollMinutes: z.number().int().min(5).max(1440),
    /** The smallest amount a request may ask for (minor units); 0 = no minimum. */
    minAmountMinor: z.number().int().min(0).max(1_000_000_000),
  })
  .strict();
export type CourierPayoutsSettings = z.output<typeof courierPayoutsSchema>;

/** PR 673: the courier's time to pay a claim, and whether money won back is posted. Off as shipped; every number is the owner's. */
export const courierClaimTermsSchema = z
  .object({
    /** On: a claim gets a deadline when it is raised, and a late one is flagged. */
    deadlineEnabled: z.boolean(),
    /** Days the courier has to pay, counted from the day the claim is raised. */
    days: z.number().int().min(1).max(365),
    /** Days before the deadline a claim is flagged "due soon"; 0 = no early flag. */
    warnDays: z.number().int().min(0).max(60),
    /** On: money won back from a courier is posted to its account (needs the owner's OK first, see BLOCKED). */
    postRecovered: z.boolean(),
  })
  .strict();
export type CourierClaimTermsSettings = z.output<typeof courierClaimTermsSchema>;

/** PR 674: the events a courier text exists for. */
export const COURIER_MESSAGE_EVENTS = ['booking', 'delivery', 'cod', 'reattempt', 'hold', 'cancel', 'returnPickup', 'claim', 'payout'] as const;
export type CourierMessageEvent = (typeof COURIER_MESSAGE_EVENTS)[number];
/** The `{tokens}` a courier text may use; each is filled from the order, parcel or claim at the moment it is used. */
export const COURIER_MESSAGE_TOKENS = ['order', 'customer', 'cod', 'courier', 'date', 'amount', 'consignment'] as const;

const messageText = templateTextSchema(COURIER_MESSAGE_TOKENS, 240);
/**
 * PR 674: editable text per event, in English and Bengali, with the placeholders above. `enabled` (off as shipped): the
 * booking, delivery and COD texts go to the courier in the parcel's note and the payout text in the payout request's
 * note; the others are offered as text to copy in Courier 360. Nothing is sent to a courier by itself.
 */
export const courierMessagesSchema = z
  .object({
    enabled: z.boolean(),
    booking: messageText,
    delivery: messageText,
    cod: messageText,
    reattempt: messageText,
    hold: messageText,
    cancel: messageText,
    returnPickup: messageText,
    claim: messageText,
    payout: messageText,
  })
  .strict();
export type CourierMessagesSettings = z.output<typeof courierMessagesSchema>;

export const couriersV5Settings = {
  'delivery.couriers': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'delivery',
    version: V670,
    schema: couriersSchema,
    // hardcode-ok: empty as shipped (Steadfast is the default until the owner picks one)
    default: { defaultCourierId: '' },
    valueType: 'JSON',
    labelKey: 'delivery.couriers.label',
    helpKey: 'delivery.couriers.help',
    sortOrder: 970,
  }),
  "delivery.courier.payouts": setting({
    scope: "store",
    isOwnerData: false,
    isPublic: false,
    group: "delivery",
    version: V671,
    schema: courierPayoutsSchema,
    // hardcode-ok: ON by the owner's written OK of 13 Nov 2026 (BLOCKED W2-1); the poll interval and the minimum are the owner's to set
    default: { enabled: true, pollMinutes: 30, minAmountMinor: 0 },
    valueType: "JSON",
    labelKey: "delivery.courier.payouts.label",
    helpKey: "delivery.courier.payouts.help",
    sortOrder: 971,
  }),
  'delivery.courier.claimTerms': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'delivery',
    version: V673,
    schema: courierClaimTermsSchema,
    // hardcode-ok: deadline off; money posting ON by the owner's written OK of 13 Nov 2026 (BLOCKED W2-2); the days are the owner's to set
    default: { deadlineEnabled: false, days: 30, warnDays: 5, postRecovered: true },
    valueType: 'JSON',
    labelKey: 'delivery.courier.claimTerms.label',
    helpKey: 'delivery.courier.claimTerms.help',
    sortOrder: 972,
  }),
  'delivery.courier.messages': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'delivery',
    version: V674,
    schema: courierMessagesSchema,
    // hardcode-ok: starting words the owner edits; nothing reaches a courier until the switch is on
    default: {
      enabled: false,
      booking: { en: 'Order {order}. Please handle with care.', bn: 'অর্ডার {order}। সাবধানে সামলাবেন।' },
      delivery: { en: 'Please call {customer} before delivery.', bn: 'ডেলিভারির আগে {customer}-কে ফোন করবেন।' },
      cod: { en: 'Collect {cod} from the customer.', bn: 'কাস্টমারের কাছ থেকে {cod} নেবেন।' },
      reattempt: { en: 'The customer asks for another try on {date}. Parcel {consignment}.', bn: 'কাস্টমার {date} তারিখে আবার চেষ্টা করতে বলেছেন। পার্সেল {consignment}।' },
      hold: { en: 'Please hold parcel {consignment} until we call.', bn: 'আমরা ফোন না করা পর্যন্ত পার্সেল {consignment} রেখে দেবেন।' }, // hardcode-ok: an instruction to the courier the owner edits, not a promise to a customer
      cancel: { en: 'Please cancel parcel {consignment} (order {order}).', bn: 'পার্সেল {consignment} (অর্ডার {order}) বাতিল করবেন।' },
      returnPickup: { en: 'Please collect the return for order {order} from {customer}.', bn: 'অর্ডার {order}-এর ফেরত পার্সেল {customer}-এর কাছ থেকে নিয়ে আসবেন।' },
      claim: { en: 'Claim for parcel {consignment}: {amount}.', bn: 'পার্সেল {consignment}-এর ক্লেইম: {amount}।' },
      payout: { en: 'Please pay the cash you hold for us: {amount}.', bn: 'আমাদের যে নগদ আপনাদের হাতে আছে তা পাঠিয়ে দিন: {amount}।' },
    },
    valueType: 'JSON',
    labelKey: 'delivery.courier.messages.label',
    helpKey: 'delivery.courier.messages.help',
    sortOrder: 973,
  }),
};
