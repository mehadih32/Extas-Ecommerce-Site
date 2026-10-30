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
//
// PR 616 (the books match; `books.close.runAt`, `books.timing.maxMinutes` and `books.close.requireMatched` are v62's):
// - `books.close.checkMinutes`: how often the nightly close looks whether the store's `books.close.runAt` has passed.
// - `books.recheck.days`: each run also checks again this many closed days before it, so a late fact on a closed day
//   is seen at once (a new version of that day and HISTORY_CHANGED when that day's own money moved after it matched).
//   A day whose ledger moved since its close (a correction, a late entry, fixed costs or a summary entered later) is
//   checked again whatever this says (qa-gate).
// - `books.run.staleMinutes` (qa-gate): one run of the books at a time per store link; a run still marked running after
//   this long (a stopped worker) no longer holds the next one back.
// - `books.adjust.reasonMinLength`: the shortest reason a correction, an override or a re-opening is written with.
// - `books.pin.minLength`, `books.pin.maxAttempts`, `books.pin.lockMinutes`: the owner's books PIN (digits only, never
//   one digit repeated or a straight run), and how many wrong tries lock it for how long.
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

  // ---- PR 616 · the books match, the closes and the owner's PIN ----
  'books.close.checkMinutes': setting({
    ...books,
    scope: 'installation',
    schema: z.int().min(1).max(120),
    default: 15,
    valueType: 'INT',
    labelKey: 'books.close.checkMinutes.label',
    helpKey: 'books.close.checkMinutes.help',
    sortOrder: 23,
  }),
  'books.recheck.days': setting({
    ...books,
    schema: z.int().min(0).max(62),
    default: 7,
    valueType: 'INT',
    labelKey: 'books.recheck.days.label',
    helpKey: 'books.recheck.days.help',
    sortOrder: 24,
  }),
  'books.adjust.reasonMinLength': setting({
    ...books,
    scope: 'installation',
    schema: z.int().min(3).max(200),
    default: 10,
    valueType: 'INT',
    labelKey: 'books.adjust.reasonMinLength.label',
    helpKey: 'books.adjust.reasonMinLength.help',
    sortOrder: 25,
  }),
  'books.pin.minLength': setting({
    ...books,
    scope: 'installation',
    schema: z.int().min(4).max(12),
    default: 6,
    valueType: 'INT',
    labelKey: 'books.pin.minLength.label',
    helpKey: 'books.pin.minLength.help',
    sortOrder: 26,
  }),
  'books.pin.maxAttempts': setting({
    ...books,
    scope: 'installation',
    schema: z.int().min(2).max(20),
    default: 5,
    valueType: 'INT',
    labelKey: 'books.pin.maxAttempts.label',
    helpKey: 'books.pin.maxAttempts.help',
    sortOrder: 27,
  }),
  'books.pin.lockMinutes': setting({
    ...books,
    scope: 'installation',
    schema: z.int().min(1).max(1440),
    default: 15,
    valueType: 'INT',
    labelKey: 'books.pin.lockMinutes.label',
    helpKey: 'books.pin.lockMinutes.help',
    sortOrder: 28,
  }),
  'books.run.staleMinutes': setting({
    ...books,
    schema: z.int().min(5).max(1440),
    default: 60,
    valueType: 'INT',
    labelKey: 'books.run.staleMinutes.label',
    helpKey: 'books.run.staleMinutes.help',
    sortOrder: 29,
  }),
};
