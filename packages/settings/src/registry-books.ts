// CN-028 · PR 615, 616 (CN-029 Phase 1, Gyani's lane) — Retail's ERP account ledger, the pipeline stock and the books
// match (docs/RETAIL-ERP-MODEL.md §3–§4). Registry version 68. Labels: messages/books.<lang>.json (the Books group of
// registry v62, Money → Books in the admin). Nothing here moves money: the shop only records what was paid, and every
// correction of the books is a reversing entry plus a new one, with the owner's PIN.
//
// PR 615:
// - `books.payments.matchDays`: a "paid to ERP" record and the ERP's `payment.recorded` are the same payment when the
//   amount is the same, the reference is the same (when both have one) and the dates are at most this many days apart
//   (§3.1: "date within 2 days").
// - `books.account.lookbackDays`: how many days back the account check reads the ERP's statement (`GET /account`), so a
//   lost `payment.recorded` webhook is caught up (follow-up 490).
// - `books.ledger.pageSize`: how many ledger entries, payments or pipeline pieces one page of Money → Books shows.
import { z } from 'zod';
import { setting } from './define';

const V = 68;

const books = { scope: 'store', isOwnerData: false, isPublic: false, group: 'books', version: V } as const;

export const booksSettings = {
  // ---- PR 615 · the ERP account ledger and the payments to the ERP ----
  'books.payments.matchDays': setting({
    ...books,
    schema: z.int().min(0).max(31),
    default: 2,
    valueType: 'INT',
    labelKey: 'books.payments.matchDays.label',
    helpKey: 'books.payments.matchDays.help',
    sortOrder: 20,
  }),
  'books.account.lookbackDays': setting({
    ...books,
    schema: z.int().min(1).max(90),
    default: 7,
    valueType: 'INT',
    labelKey: 'books.account.lookbackDays.label',
    helpKey: 'books.account.lookbackDays.help',
    sortOrder: 21,
  }),
  'books.ledger.pageSize': setting({
    ...books,
    scope: 'installation',
    schema: z.int().min(10).max(200),
    default: 50,
    valueType: 'INT',
    labelKey: 'books.ledger.pageSize.label',
    helpKey: 'books.ledger.pageSize.help',
    sortOrder: 22,
  }),
};
