// CN-029 Phase 0 — the lists in this package mirror the database enums of PR 607–618 (packages/db/prisma/schema.prisma).
// The schema is read as text, so this package needs no database client; a value added on one side only fails here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BOOKS_ADJUSTMENT_KINDS,
  BOOKS_CHECKS,
  BOOKS_DIFFERENCE_CLASSES,
  BOOKS_DIFFERENCE_STATUSES,
  BOOKS_PERIOD_LEVELS,
  BOOKS_RESULTS,
  BOOKS_RUN_STATUSES,
  COST_SUMMARY_LINES,
  ERP_ACCOUNT_ENTRY_KINDS,
  ERP_BOOKS_SEND_KINDS,
  ERP_DELIVERY_STATUSES,
  ERP_ENTRY_SOURCES,
  ERP_EVENT_SOURCES,
  ERP_EVENT_STATUSES,
  ERP_GRADES,
  ERP_LINE_ACTIONS,
  ERP_LINE_STATES,
  ERP_PIECE_STATES,
  ERP_RETURN_LIST_STATUSES,
} from './index';

const schema = readFileSync(fileURLToPath(new URL('../../db/prisma/schema.prisma', import.meta.url)), 'utf8');

function enumValues(name: string): string[] {
  const m = new RegExp(`^enum ${name} \\{([^}]*)\\}`, 'm').exec(schema);
  if (!m) throw new Error(`enum ${name} is not in the schema`);
  return m[1]!
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => l && !l.startsWith('@@'))
    .map((l) => l.split(/\s+/)[0]!);
}

const PAIRS: [string, readonly string[]][] = [
  ['ErpGrade', ERP_GRADES],
  ['ErpEventSource', ERP_EVENT_SOURCES],
  ['ErpEventStatus', ERP_EVENT_STATUSES],
  ['ErpLineState', ERP_LINE_STATES],
  ['ErpLineAction', ERP_LINE_ACTIONS],
  ['ErpDeliveryOutcome', ERP_DELIVERY_STATUSES],
  ['ErpAccountEntryKind', ERP_ACCOUNT_ENTRY_KINDS],
  ['ErpEntrySource', ERP_ENTRY_SOURCES],
  ['ErpPieceState', ERP_PIECE_STATES],
  ['ErpReturnListStatus', ERP_RETURN_LIST_STATUSES],
  ['ErpBooksSendKind', ERP_BOOKS_SEND_KINDS],
  ['BooksRunStatus', BOOKS_RUN_STATUSES],
  ['BooksPeriodLevel', BOOKS_PERIOD_LEVELS],
  ['BooksResult', BOOKS_RESULTS],
  ['BooksCheck', BOOKS_CHECKS],
  ['BooksDifferenceClass', BOOKS_DIFFERENCE_CLASSES],
  ['BooksDifferenceStatus', BOOKS_DIFFERENCE_STATUSES],
  ['BooksAdjustmentKind', BOOKS_ADJUSTMENT_KINDS],
  ['CostSummaryLine', COST_SUMMARY_LINES],
];

describe('CN-029: the shared ERP lists equal the database enums', () => {
  it.each(PAIRS)('%s', (name, list) => {
    expect([...list].sort()).toEqual(enumValues(name).sort());
  });
});
