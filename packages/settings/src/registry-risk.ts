// S06 · a number's history. Registry version 43. Labels: messages/risk.<lang>.json (the Orders group).
//
// PR 157 (`risk.history`): what counts in a number's history — how many earlier orders are read, the refusals that are
// the shop's fault, the call outcomes that mean "did not answer". SIM-F-044: a refusal the shop caused (late after the
// promise, the wrong item, damaged, arrived after Eid, "did not order") never counts against the customer —
// `risk.history.ourFaultRefusals` lists those refusal reasons (`orders.refusal.reasons` keys).
import { z } from 'zod';
import { setting } from './define';
import { dictionaryKeySchema } from './schemas';

const V = 43;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

/**
 * PR 157 — what counts in a number's history (the order page's line and the score's facts). `orders`: how many of its
 * earlier orders are read, newest first. `ourFaultRefusals`: refusal reasons the shop caused — shown, never counted
 * (SIM-F-044). `noAnswerOutcomes`: the call outcomes that mean "did not answer" (the call screen's codes).
 */
export const riskHistorySchema = z
  .object({ orders: z.int().min(10).max(2_000), ourFaultRefusals: z.array(dictionaryKeySchema).max(100), noAnswerOutcomes: z.array(z.string().trim().min(1).max(60)).max(20) })
  .strict();

export const riskSettings = {
  'risk.history': setting({
    ...base,
    schema: riskHistorySchema,
    default: { orders: 200, ourFaultRefusals: ['late', 'wrong-item', 'damaged', 'after-eid', 'did-not-order'], noAnswerOutcomes: ['NO_ANSWER'] },
    valueType: 'JSON',
    labelKey: 'risk.history.label',
    helpKey: 'risk.history.help',
    sortOrder: 330,
  }),
};
