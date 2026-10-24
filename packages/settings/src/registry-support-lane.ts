// S04 · the support explanation panel — PR 566. Registry version 38 (36 is the set builder's, 37 the order edit's). Labels:
// messages/support-lane.<lang>.json. The panel is a card on one order's admin page (/admin/orders/<id>); its key lives in
// Orders → Order settings and is set through the settings store until that tab is drawn on the new admin shell.
//
// Nothing here moves money, changes a price, a discount or COD, or blocks anyone: the panel only reads what the order
// already stores (the advance asked and why, the delivery band and charge the customer was shown) and puts it in words.
import { z } from 'zod';
import { setting } from './define';
import { templateTextSchema } from './schemas';

const V = 38;

/** The `{tokens}` a "what to say" line may use: amounts are formatted and filled in when the panel is drawn. */
export const EXPLAIN_TOKENS = ['amount', 'paid', 'charge', 'band', 'area', 'over'] as const;

const say = templateTextSchema(EXPLAIN_TOKENS, 400);

/**
 * PR 566 — the support explanation panel: one click on an order gives the agent why this customer was asked for an
 * advance (and why the delivery charge rather than the full amount), and why the delivery charge is what it is, read
 * from the order's own stored facts (the advance the checkout or the team asked for, the gift's rule, Cash on Delivery
 * turned off at checkout, the band, the place and the charge the customer was shown). `showRisk`: the risk score and
 * level are shown to the agent (never in the words for the customer). `say`: the neutral words the agent can read out
 * on the phone or copy into a chat, one per reason, in both languages — no score, no rule name, only the amounts.
 * On by default: it is a reading aid for the team, it changes nothing and costs nothing.
 */
export const orderExplainSchema = z
  .object({
    enabled: z.boolean(),
    showRisk: z.boolean(),
    say: z
      .object({
        advanceDelivery: say,
        advanceFull: say,
        advancePart: say,
        advanceGift: say,
        codOff: say,
        chargeBand: say,
        chargeFree: say,
        chargeFreeOver: say,
        chargePrepaid: say,
        chargeNotFixed: say,
      })
      .strict(),
  })
  .strict();

const json = { scope: 'store', valueType: 'JSON', isOwnerData: false, isPublic: false, version: V } as const;

export const supportLaneSettings = {
  'orders.explain': setting({
    ...json,
    group: 'orders',
    schema: orderExplainSchema,
    default: {
      enabled: true,
      showRisk: true,
      say: {
        advanceDelivery: {
          en: 'For this order we take only the delivery charge, {amount}, in advance. The rest you pay when the parcel arrives.',
          bn: 'এই অর্ডারে আমরা শুধু ডেলিভারি চার্জ {amount} আগে নিই। বাকিটা পার্সেল হাতে পেয়ে দেবেন।',
        },
        advanceFull: {
          en: 'For this order we take the full amount, {amount}, in advance, and then send it out right away.',
          bn: 'এই অর্ডারে পুরো টাকা {amount} আগে নিই, তারপর সাথে সাথে পাঠিয়ে দিই।',
        },
        advancePart: {
          en: 'For this order we take {amount} in advance. The rest you pay when the parcel arrives.',
          bn: 'এই অর্ডারে {amount} আগে নিই। বাকিটা পার্সেল হাতে পেয়ে দেবেন।',
        },
        advanceGift: {
          en: 'Gift orders are paid in advance — {amount} — so the person receiving it pays nothing at the door.',
          bn: 'গিফট অর্ডারের টাকা আগে নেওয়া হয় — {amount} — যাতে যিনি পাবেন তাঁকে দরজায় কিছু দিতে না হয়।',
        },
        codOff: {
          en: 'Cash on delivery was not open for this order, so it is paid in advance: {amount}.',
          bn: 'এই অর্ডারে ক্যাশ অন ডেলিভারি ছিল না, তাই টাকা আগে দিতে হয়: {amount}।',
        },
        chargeBand: {
          en: 'Your address is in our {band} delivery area, so the delivery charge is {charge}.',
          bn: 'আপনার ঠিকানা আমাদের {band} ডেলিভারি এলাকায়, তাই ডেলিভারি চার্জ {charge}।',
        },
        chargeFree: {
          en: 'Delivery on this order is free.',
          bn: 'এই অর্ডারে ডেলিভারি ফ্রি।',
        },
        chargeFreeOver: {
          en: 'Delivery is free on orders of {over} or more, and this order is over that.',
          bn: '{over} বা তার বেশি অর্ডারে ডেলিভারি ফ্রি, আর এই অর্ডার তার বেশি।',
        },
        chargePrepaid: {
          en: 'Delivery is free because the order is paid online.',
          bn: 'অনলাইনে পেমেন্ট করায় ডেলিভারি ফ্রি।',
        },
        chargeNotFixed: {
          en: 'The delivery charge for your address is confirmed with you on the phone, before the parcel goes out.',
          bn: 'পার্সেল পাঠানোর আগে ফোনে ডেলিভারি চার্জ জানিয়ে দেব।',
        },
      },
    },
    labelKey: 'orders.explain.label',
    helpKey: 'orders.explain.help',
    sortOrder: 970,
  }),
};

export type OrderExplainSettings = z.output<typeof orderExplainSchema>;
