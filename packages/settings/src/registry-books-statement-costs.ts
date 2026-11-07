// Follow-up 565 (PR 618, with PR 166 / 174) — the cost lines of the ERP daily summary written by the statements the shop
// already imports. Registry version 274. Labels: messages/books-summary.<lang>.json (`books.costs.fromStatements`);
// edited on Money › Costs, in the "Costs from statements" card.
//
// - `books.costs.fromStatements.courierCharges`: off as shipped (the courier's charges are entered by hand on Money ›
//   Costs, line "Courier"). On: a courier's COD statement, once imported (Money › COD), writes the charges it deducted
//   as one cost entry on the DELIVERY line, on the day it is imported, pointing at the statement.
// - `books.costs.fromStatements.gatewayFees`: the same for a gateway's statement (bKash, Nagad, card) and its fees, on
//   the PAYMENT_FEES line.
// Turn a line on only when nobody enters the same costs by hand any more, or they count twice. A statement's entry is
// put right at its source (it is not reversed on Money › Costs). A record of the shop's own costs: nothing is paid,
// claimed or moved.
import { z } from 'zod';
import { setting } from './define';

const V = 274;

export const statementCostsSchema = z
  .object({
    courierCharges: z.boolean(),
    gatewayFees: z.boolean(),
  })
  .strict();
export type StatementCostsSettings = z.output<typeof statementCostsSchema>;

export const statementCostsSettings = {
  'books.costs.fromStatements': setting({
    scope: 'store',
    schema: statementCostsSchema,
    default: { courierCharges: false, gatewayFees: false },
    valueType: 'JSON',
    group: 'books',
    labelKey: 'books.costs.fromStatements.label',
    helpKey: 'books.costs.fromStatements.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 11,
    version: V,
  }),
} as const;
