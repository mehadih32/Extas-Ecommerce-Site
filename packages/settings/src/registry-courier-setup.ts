// S28 · PR 803 (CN-048, admin prototype v5 m-couriers.js "Setup" tab) — registry version 803. Couriers › Setup keeps, for each
// courier account, the pick-up place and time, the smallest payout worth asking for and the days the courier takes to pay
// (the prototype's per-courier card). Empty as shipped: nothing is set until the owner types it; a courier with no entry
// uses the shop-wide minimum (`delivery.courier.payouts`). Labels: messages/courier-setup.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V803 = 803;

/** One courier's own setup. Empty text / 0 = not set. */
export const courierSetupEntrySchema = z
  .object({
    pickupPlace: z.string().trim().max(120),
    /** 24-hour HH:MM, or empty. */
    pickupTime: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
    /** The smallest payout to ask this courier for (minor units); 0 = use the shop-wide minimum. */
    minPayoutMinor: z.number().int().min(0).max(1_000_000_000),
    /** Days the courier takes to pay, for the expected date; 0 = not set. */
    payDays: z.number().int().min(0).max(14),
  })
  .strict();
export type CourierSetupEntry = z.output<typeof courierSetupEntrySchema>;

export const courierSetupSchema = z.object({ couriers: z.record(z.uuid(), courierSetupEntrySchema) }).strict();
export type CourierSetupSettings = z.output<typeof courierSetupSchema>;

export const courierSetupSettings = {
  'delivery.courier.setup': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'delivery',
    version: V803,
    schema: courierSetupSchema,
    // hardcode-ok: empty as shipped; pick-up place and time, minimum payout and pay days are the owner's to type per courier
    default: { couriers: {} },
    valueType: 'JSON',
    labelKey: 'delivery.courier.setup.label',
    helpKey: 'delivery.courier.setup.help',
    sortOrder: 971,
  }),
};
