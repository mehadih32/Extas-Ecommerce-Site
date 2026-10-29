// CN-028 · PR 610–614 (CN-029 Phase 0) — the shop-side states of the v6 tables that are not ledgers: an order line as
// the ERP has it, a courier return list, and the ERP event ledger's processing state. Each list has the same values in
// the same order as its Prisma enum (checked by a test in packages/inventory).

/** ErpOrderLine.state (PR 610): a Return-stock piece that failed the packing check is SHORT until filled or decided. */
export const ERP_LINE_STATES = ['OPEN', 'SHORT', 'CANCELLED', 'REMOVED'] as const;
export type ErpLineState = (typeof ERP_LINE_STATES)[number];

/** ErpReturnList.status (PR 612). */
export const ERP_RETURN_LIST_STATUSES = ['OPEN', 'SENT', 'ACCEPTED', 'REFUSED'] as const;
export type ErpReturnListStatus = (typeof ERP_RETURN_LIST_STATUSES)[number];

/** ErpEvent.status (PR 608): only this, the attempts, the result and the error of an event ever change. */
export const ERP_EVENT_STATUSES = ['RECEIVED', 'APPLIED', 'STORED', 'WAITING_ORIGINAL', 'IGNORED', 'FAILED'] as const;
export type ErpEventStatus = (typeof ERP_EVENT_STATUSES)[number];

/** ErpEvent.source (PR 608): the same event by webhook and by pull is one row. */
export const ERP_EVENT_SOURCES = ['WEBHOOK', 'PULL'] as const;
export type ErpEventSource = (typeof ERP_EVENT_SOURCES)[number];
