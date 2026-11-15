// PR 846, 851 (owner order 15 Nov 2026: the real admin equals prototype v5 100%, lane E5) — the two small settings the prototype's
// Settings pages still needed. Nothing here moves money, sends anything or deletes anything; both ship at the prototype's own
// starting choice and are editable on their own page. Registry version 846-851.
// - `privacy.answerDays` (PR 846): how many days the shop has to answer a customer's privacy request (Data & privacy › "Answer within
//   30 days"). The page's reminder and each request's "days left" read it; nothing closes a request by itself.
// - `erp.matching` (PR 851): which ERP account each kind of money lands in (Settings › ERP connection › Matching): courier cash, bKash
//   and the account the shop pays the ERP from. The ERP warehouse is not here: it is the store's own mapping row (StoreErpMapping).
// Labels: messages/parity-e5.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const text = (max: number) => z.string().trim().max(max);
const base = { scope: 'installation', valueType: 'JSON', group: 'system', isOwnerData: false, isPublic: false } as const;

export const PRIVACY_ANSWER_DAYS_MAX = 365; // hardcode-ok: technical bound (a year)
export const PRIVACY_ANSWER_DAYS_DEFAULT = 30; // hardcode-ok: the prototype's own starting choice, editable on the page

export const erpMatchingSchema = z.object({ cod: text(80), bkash: text(80), erpPay: text(80) }).strict();
export type ErpMatchingSettings = z.output<typeof erpMatchingSchema>;
export const ERP_MATCHING_DEFAULT: ErpMatchingSettings = { cod: '', bkash: '', erpPay: '' }; // hardcode-ok: shipped empty; the owner names the ERP accounts

export const roleDefaultAccessSchema = z.record(z.string().min(1).max(80), z.array(z.string().min(1).max(120)).max(2000)); // hardcode-ok: technical bounds
export type RoleDefaultAccess = z.output<typeof roleDefaultAccessSchema>;

export const parityE5Settings = {
  // PR 852: the access "Back to default" loads for a role on Settings › Team & roles (role key -> permission keys). Shipped empty; a role
  // with no entry reads as view-only (its ".read" keys). It only fills the screen's pending changes: saving still asks the owner's PIN.
  'roles.defaultAccess': setting({
    ...base,
    group: 'security',
    isOwnerData: true,
    schema: roleDefaultAccessSchema.nullable(),
    default: null,
    labelKey: 'roles.defaultAccess.label',
    helpKey: 'roles.defaultAccess.help',
    sortOrder: 852,
    version: 852,
  }),
  'privacy.answerDays': setting({
    ...base,
    valueType: 'INT',
    group: 'privacy',
    schema: z.int().min(1).max(PRIVACY_ANSWER_DAYS_MAX),
    default: PRIVACY_ANSWER_DAYS_DEFAULT,
    labelKey: 'privacy.answerDays.label',
    helpKey: 'privacy.answerDays.help',
    sortOrder: 846,
    version: 846,
  }),
  'erp.matching': setting({
    ...base,
    group: 'erp',
    isOwnerData: true,
    schema: erpMatchingSchema.nullable(),
    default: null, // owner data ships without a value; ERP_MATCHING_DEFAULT is what an unset value reads as
    labelKey: 'erp.matching.label',
    helpKey: 'erp.matching.help',
    sortOrder: 851,
    version: 851,
  }),
};
