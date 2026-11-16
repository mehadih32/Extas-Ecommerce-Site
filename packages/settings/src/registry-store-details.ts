// PR 789 (owner order 15 Nov 2026: the real admin equals prototype v5 100%) — Settings › Store details, the cards the
// prototype draws (docs/demo/admin-proto-v5/js/m-settings.js `renderStore`). The shop's name, phone, e-mail, address, social
// links, legal numbers and order number prefix already had their own settings; this one JSON setting holds the rest of
// the page: the owner's name and licence expiry, TIN, e-CAB, officers, the other addresses and e-mails, support hours, brand
// colours, the lines printed on invoices and stickers, how money and the customers' language show, the VAT switch and the
// month's targets. Owner data (never shipped to another installation). Owner data ships without a value (null = everything empty or off, STORE_DETAILS_DEFAULT). Registry version 789.
// Labels: messages/store-details.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V = 991; // 789 introduced it; 991 adds the warehouse map pin switch

const text = (max: number) => z.string().trim().max(max);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like 10:00').or(z.literal(''));
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour like #E2552B').or(z.literal(''));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a day like 2026-12-31').or(z.literal(''));

export const STORE_CLOSED_DAYS = ['none', 'friday', 'saturday'] as const;
export const STORE_STICKER_SIZES = ['4x3', '4x6', 'a6', '75x50'] as const;
export const STORE_MONEY_FORMATS = ['bd', 'intl'] as const;
export const STORE_CUSTOMER_LANGS = ['both', 'bn', 'en'] as const;

export const storeDetailsSchema = z
  .object({
    ownerName: text(120),
    tlExpiry: day,
    tin: text(40),
    ecab: text(40),
    complaintOfficer: text(160),
    dpo: text(160),
    warehouseAddr: text(300),
    /** PR 991: the warehouse is pinned on the map for the couriers (the prototype's "Pin warehouse on map"). */
    warehousePin: z.boolean().default(false),
    returnsAddr: text(300),
    supportEmail: z.email().max(254).or(z.literal('')),
    ordersEmail: z.email().max(254).or(z.literal('')),
    accountsEmail: z.email().max(254).or(z.literal('')),
    supportOpens: hhmm,
    supportCloses: hhmm,
    closedDay: z.enum(STORE_CLOSED_DAYS),
    colorMain: hex,
    colorSecond: hex,
    invHead: text(160),
    invFoot: text(240),
    stHead: text(60),
    stFoot: text(120),
    stSize: z.enum(STORE_STICKER_SIZES),
    moneyFmt: z.enum(STORE_MONEY_FORMATS),
    custLang: z.enum(STORE_CUSTOMER_LANGS),
    showVat: z.boolean(),
    targetSales: z.int().min(0).max(1_000_000_000),
    targetProfit: z.int().min(0).max(1_000_000_000),
    targetAdPct: z.int().min(0).max(100),
  })
  .strict()
  .refine((v) => !v.supportOpens || !v.supportCloses || v.supportOpens < v.supportCloses, { message: 'the shop opens before it closes', path: ['supportCloses'] });
export type StoreDetails = z.output<typeof storeDetailsSchema>;

export const STORE_DETAILS_DEFAULT: StoreDetails = {
  ownerName: '',
  tlExpiry: '',
  tin: '',
  ecab: '',
  complaintOfficer: '',
  dpo: '',
  warehouseAddr: '',
  warehousePin: false,
  returnsAddr: '',
  supportEmail: '',
  ordersEmail: '',
  accountsEmail: '',
  supportOpens: '',
  supportCloses: '',
  closedDay: 'none',
  colorMain: '',
  colorSecond: '',
  invHead: '',
  invFoot: '',
  stHead: '',
  stFoot: '',
  stSize: '4x3',
  moneyFmt: 'bd',
  custLang: 'both',
  showVat: false,
  targetSales: 0,
  targetProfit: 0,
  targetAdPct: 0,
};

export const storeDetailsSettings = {
  'store.details': setting({
    schema: storeDetailsSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'store',
    labelKey: 'store.details.label',
    helpKey: 'store.details.help',
    isOwnerData: true,
    sortOrder: 40,
    version: V,
  }),
};
