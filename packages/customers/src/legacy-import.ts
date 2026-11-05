// S14 · PR 535 — the legacy customer import (Customers › More › Import old customers, /admin/customers/import; demo
// V12.4 97u-adm2-customers.js CUS-06 "Upload the old order list → de-duplicate preview → apply. Never overwrites"):
//
// - Off as shipped (`customers.legacyImport`); it needs the import's own key `customers.import`.
// - A preview first: the file is read with the person's choices (which column is which, what each status word means,
//   how a date is written), and nothing is saved: the rows, bad numbers, the people in it, new people, people already
//   here (matched by phone), the same old order twice in the file, old orders brought in before. More rows than the
//   owner's `maxRows` are refused with the count, never cut.
// - Then the import, only when the person confirms: each old order becomes a LegacyOrderRecord — history only, never an
//   Order (no stock, no money, never in Sales), and nothing is sent to anyone. A number not here yet gets a new profile
//   (name from the file, "first came from" the import, first seen on his oldest order), with no consent for offers; a
//   number already here keeps everything it has: only the old orders are added beside it. The same old order is never
//   brought in twice. One LegacyImport row and one audit line per import, in one transaction.
// - Undo an import: its records and the profiles it made that still have no order, no merge and no later records are
//   archived, never deleted (audited). The file itself is never kept.
// - The customer's page reads the old orders' counts (`legacyHistory`).
//
// Not done here: an erased person (PR 302/382) has no number left to match, so a file carrying his number again makes a
// new profile; the owner should take such a person out of the file.
import { audit, can } from '@extas/auth';
import { CsvSyntaxError } from '@extas/catalogue';
import type { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { allow, nowOf, parse, setting, TX, UUID, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';
import { guessMapping, guessOutcome, LEGACY_DATE_ORDERS, LEGACY_FIELDS, LEGACY_OUTCOMES, legacyHeader, readLegacyFile, statusWords, type LegacyDateOrder, type LegacyMapping, type LegacyOutcome, type LegacyRow } from './legacy-csv';
import { phoneShown, type PhoneShown } from './pure';
import { maskOf } from './view';

/** "First came from" on a profile the import made (the order channels' own "Imported", OrderSource IMPORT). */
export const LEGACY_SOURCE = 'IMPORT';
/** A safety bound on the file's text (not a business number; the owner's `maxRows` is the limit that counts). */
export const LEGACY_FILE_MAX_CHARS = 20_000_000; // hardcode-ok: a read bound, not a business figure
/** How many problem lines and sample rows the preview names, and how many past imports the page lists. */
const SHOW = { badLines: 20, sample: 8, imports: 20, statuses: 100 } as const; // hardcode-ok: screen bounds
const CHUNK = 1_000; // hardcode-ok: a query batch size

const column = z.int().min(0).max(500).nullable();
const words = z.array(z.string().max(60)).max(40);
export const legacyInput = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    csv: z.string().min(1).max(LEGACY_FILE_MAX_CHARS),
    mapping: z.object({ phone: column, name: column, address: column, orderedAt: column, total: column, status: column, ref: column }).strict().optional(),
    statuses: z
      .record(z.string().max(200), z.enum(LEGACY_OUTCOMES))
      .refine((r) => Object.keys(r).length <= SHOW.statuses)
      .optional(),
    dateOrder: z.enum(LEGACY_DATE_ORDERS).default('dmy'),
    /** The admin's own words for a first guess (its dictionary, en + bn). */
    hints: z.object({ fields: z.partialRecord(z.enum(LEGACY_FIELDS), words).optional(), outcomes: z.partialRecord(z.enum(LEGACY_OUTCOMES), words).optional() }).strict().optional(),
  })
  .strict();
const runInput = legacyInput.extend({ confirm: z.literal(true) });
const undoInput = z.object({ reason: z.string().trim().max(300).optional() }).strict();

export type RowFate = 'new' | 'matched' | 'sameInFile' | 'before' | 'badPhone';

export interface LegacyCounts {
  rows: number;
  badPhone: number;
  /** Different numbers among the rows to bring in. */
  people: number;
  newPeople: number;
  matched: number;
  sameInFile: number;
  importedBefore: number;
  toImport: number;
  noDate: number;
  outcomes: Record<LegacyOutcome, number>;
}

export interface LegacyPreview {
  fileName: string;
  header: string[];
  mapping: LegacyMapping;
  dateOrder: LegacyDateOrder;
  /** Each status word in the file, how many rows carry it and what it is taken to mean. */
  statuses: { text: string; rows: number; outcome: LegacyOutcome }[];
  /** False while no column is chosen as the phone number. */
  ready: boolean;
  counts: LegacyCounts;
  badLines: number[];
  sample: { line: number; phone: PhoneShown | null; name: string | null; orderedAt: Date | null; statusText: string | null; outcome: LegacyOutcome; fate: RowFate }[];
}

export interface LegacyImportRow {
  id: string;
  fileName: string | null;
  createdAt: Date;
  by: string | null;
  rowsTotal: number;
  rowsImported: number;
  duplicates: number;
  newPeople: number;
  matched: number;
  undoneAt: Date | null;
}

export interface LegacyImportScreen {
  enabled: boolean;
  maxRows: number;
  canImport: boolean;
  imports: LegacyImportRow[];
}

/** Currency digits (BDT and the others the shop takes are 2). */
const digitsOf = (currency: string): number => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
const chunks = <T>(xs: readonly T[]): T[][] => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));
const counted = (summary: Prisma.JsonValue | null, k: 'newPeople' | 'matched'): number => {
  const c = summary && typeof summary === 'object' && !Array.isArray(summary) ? (summary as { counts?: Partial<LegacyCounts> }).counts : undefined;
  return typeof c?.[k] === 'number' ? c[k] : 0;
};

/** The page: the switch, the limit, whether this person may import, and the imports so far (newest first). */
export async function legacyImportScreen(deps: CustomersDeps, who: Who): Promise<LegacyImportScreen> {
  await allow(deps, who, 'customers.read');
  const S = who.storeId;
  const [cfg, held, rows] = await Promise.all([
    setting(deps, S, 'customers.legacyImport'),
    can(deps.db, who.actor, 'customers.import', { storeId: S }),
    deps.db.legacyImport.findMany({ where: { storeId: S }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: SHOW.imports }),
  ]);
  const staffIds = [...new Set(rows.map((r) => r.startedById).filter((x): x is string => !!x))];
  const staff = staffIds.length ? await deps.db.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } }) : [];
  const name = new Map(staff.map((s) => [s.id, s.displayName]));
  return {
    enabled: cfg.enabled,
    maxRows: cfg.maxRows,
    canImport: held,
    imports: rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      createdAt: r.createdAt,
      by: r.startedById ? (name.get(r.startedById) ?? null) : null,
      rowsTotal: r.rowsTotal,
      rowsImported: r.rowsImported,
      duplicates: r.duplicates,
      newPeople: counted(r.summary, 'newPeople'),
      matched: counted(r.summary, 'matched'),
      undoneAt: r.undoneAt,
    })),
  };
}

interface Plan {
  d: z.output<typeof legacyInput>;
  header: string[];
  mapping: LegacyMapping;
  statusMap: Record<string, LegacyOutcome>;
  words: { text: string; rows: number }[];
  rows: LegacyRow[];
  fate: RowFate[];
  /** Profiles already here, by number. */
  existing: Map<string, string>;
  counts: LegacyCounts;
}

async function plan(deps: CustomersDeps, who: Who, input: unknown, schema: typeof legacyInput | typeof runInput): Promise<Plan> {
  await allow(deps, who, 'customers.import');
  const d = parse(schema, input, 'import') as z.output<typeof legacyInput>;
  const S = who.storeId;
  const [cfg, currency] = await Promise.all([setting(deps, S, 'customers.legacyImport'), setting(deps, S, 'store.currency')]);
  if (!cfg.enabled) throw new CustomersError('SWITCHED_OFF', 'the legacy import is switched off', ['customers.legacyImport']);
  let header: string[];
  try {
    header = legacyHeader(d.csv);
  } catch (e) {
    if (e instanceof CsvSyntaxError) throw new CustomersError('BAD_FILE', e.message, ['csv'], { line: e.line });
    throw e;
  }
  const mapping = d.mapping ?? guessMapping(header, d.hints?.fields ?? {});
  for (const f of LEGACY_FIELDS) if (mapping[f] !== null && mapping[f] >= header.length) throw new CustomersError('INVALID_INPUT', `the file has no column ${mapping[f]}`, [`mapping.${f}`]);
  const words = statusWords(d.csv, mapping.status);
  const statusMap: Record<string, LegacyOutcome> = Object.fromEntries(words.map((w) => [w.text, d.statuses?.[w.text] ?? guessOutcome(w.text, d.hints?.outcomes ?? {})]));
  const { rows } = readLegacyFile(d.csv, { mapping, statuses: statusMap, digits: digitsOf(currency), dateOrder: d.dateOrder });
  if (rows.length > cfg.maxRows) throw new CustomersError('IMPORT_TOO_LARGE', `${rows.length} rows are more than one import takes (${cfg.maxRows})`, ['maxRows'], { count: rows.length, maxRows: cfg.maxRows });
  const phones = [...new Set(rows.flatMap((r) => (r.phone ? [r.phone] : [])))];
  const prints = [...new Set(rows.flatMap((r) => (r.phone ? [r.fingerprint] : [])))];
  const existing = new Map<string, string>();
  const before = new Set<string>();
  for (const part of chunks(phones)) for (const c of await deps.db.customer.findMany({ where: { storeId: S, phone: { in: part } }, select: { id: true, phone: true } })) existing.set(c.phone!, c.id);
  for (const part of chunks(prints))
    for (const r of await deps.db.legacyOrderRecord.findMany({ where: { storeId: S, fingerprint: { in: part }, archivedAt: null }, select: { fingerprint: true } })) before.add(r.fingerprint);
  const seen = new Set<string>();
  const fate = rows.map((r): RowFate => {
    if (!r.phone) return 'badPhone';
    if (seen.has(r.fingerprint)) return 'sameInFile';
    seen.add(r.fingerprint);
    if (before.has(r.fingerprint)) return 'before';
    return existing.has(r.phone) ? 'matched' : 'new';
  });
  const taking = rows.filter((_, i) => fate[i] === 'new' || fate[i] === 'matched');
  const people = new Set(taking.map((r) => r.phone!));
  const outcomes = Object.fromEntries(LEGACY_OUTCOMES.map((o) => [o, taking.filter((r) => r.outcome === o).length])) as Record<LegacyOutcome, number>;
  const counts: LegacyCounts = {
    rows: rows.length,
    badPhone: fate.filter((f) => f === 'badPhone').length,
    people: people.size,
    newPeople: [...people].filter((p) => !existing.has(p)).length,
    matched: [...people].filter((p) => existing.has(p)).length,
    sameInFile: fate.filter((f) => f === 'sameInFile').length,
    importedBefore: fate.filter((f) => f === 'before').length,
    toImport: taking.length,
    noDate: taking.filter((r) => !r.orderedAt).length,
    outcomes,
  };
  return { d, header, mapping, statusMap, words, rows, fate, existing, counts };
}

/** The preview (`customers.import`, while on): nothing is saved. */
export async function previewLegacyImport(deps: CustomersDeps, who: Who, input: unknown): Promise<LegacyPreview> {
  const p = await plan(deps, who, input, legacyInput);
  const viewer = await allow(deps, who, 'customers.read');
  const mask = await maskOf(deps, who.storeId);
  return {
    fileName: p.d.fileName,
    header: p.header,
    mapping: p.mapping,
    dateOrder: p.d.dateOrder,
    statuses: p.words.map((w) => ({ ...w, outcome: p.statusMap[w.text] ?? 'other' })),
    ready: p.mapping.phone !== null,
    counts: p.counts,
    badLines: p.rows.filter((_, i) => p.fate[i] === 'badPhone').slice(0, SHOW.badLines).map((r) => r.line),
    sample: p.rows.slice(0, SHOW.sample).map((r, i) => ({ line: r.line, phone: phoneShown(r.phone ?? r.phoneRaw, viewer.fullPhone, mask), name: r.name, orderedAt: r.orderedAt, statusText: r.statusText, outcome: r.outcome, fate: p.fate[i]! })),
  };
}

export interface LegacyImportResult {
  importId: string;
  counts: LegacyCounts;
}

/** The import itself, after the preview, when the person confirms (`customers.import`, while on; audited). */
export async function runLegacyImport(deps: CustomersDeps, who: Who, input: unknown): Promise<LegacyImportResult> {
  const p = await plan(deps, who, input, runInput);
  if (p.mapping.phone === null) throw new CustomersError('INVALID_INPUT', 'choose the column with the phone number', ['mapping.phone']);
  if (!p.counts.toImport) throw new CustomersError('NOTHING_TO_IMPORT', 'no row of this file is new', ['csv']);
  const S = who.storeId;
  const now = nowOf(deps);
  const taking = p.rows.filter((_, i) => p.fate[i] === 'new' || p.fate[i] === 'matched');
  const fresh = new Map<string, { name: string | null; first: Date | null }>();
  for (const r of taking) {
    if (p.existing.has(r.phone!)) continue;
    const f = fresh.get(r.phone!) ?? { name: null, first: null };
    fresh.set(r.phone!, { name: f.name ?? r.name, first: r.orderedAt && (!f.first || r.orderedAt < f.first) ? r.orderedAt : f.first });
  }
  const summary = { mapping: p.mapping, dateOrder: p.d.dateOrder, statuses: p.statusMap, counts: p.counts };
  const imp = await deps.db.$transaction(async (tx) => {
    const row = await tx.legacyImport.create({
      data: { storeId: S, source: 'csv', fileName: p.d.fileName, status: 'SUCCEEDED', rowsTotal: p.counts.rows, rowsImported: p.counts.toImport, duplicates: p.counts.sameInFile + p.counts.importedBefore, startedById: who.actor.staffUserId ?? null, finishedAt: now, summary: summary as unknown as Prisma.InputJsonValue },
      select: { id: true },
    });
    const made = [...fresh].map(([phone, f]) => ({ storeId: S, phone, name: f.name, firstSource: LEGACY_SOURCE, legacyImportId: row.id, createdAt: f.first ?? now }));
    for (const part of chunks(made)) await tx.customer.createMany({ data: part, skipDuplicates: true });
    const ids = new Map<string, string>();
    for (const part of chunks([...new Set(taking.map((r) => r.phone!))])) for (const c of await tx.customer.findMany({ where: { storeId: S, phone: { in: part } }, select: { id: true, phone: true } })) ids.set(c.phone!, c.id);
    const records = taking.map((r) => ({ storeId: S, importId: row.id, customerId: ids.get(r.phone!) ?? null, phone: r.phone!, name: r.name, address: r.address, ref: r.ref, orderedAt: r.orderedAt, totalMinor: r.totalMinor, statusText: r.statusText, outcome: r.outcome, fingerprint: r.fingerprint }));
    for (const part of chunks(records)) await tx.legacyOrderRecord.createMany({ data: part });
    await audit(tx, who.actor, { storeId: S, action: 'customers.legacyImport', entityType: 'LegacyImport', entityId: row.id, before: null, after: { fileName: p.d.fileName, ...p.counts } }, who.ctx);
    return row;
  }, TX);
  return { importId: imp.id, counts: p.counts };
}

export interface LegacyUndoResult {
  records: number;
  profilesArchived: number;
  /** Profiles the import made that are kept: they have an order, a merge or old orders from another import since. */
  profilesKept: number;
}

/** Undo an import (`customers.import`; audited): archived, never deleted. */
export async function undoLegacyImport(deps: CustomersDeps, who: Who, id: string, input: unknown = {}): Promise<LegacyUndoResult> {
  await allow(deps, who, 'customers.import');
  if (!UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such import', ['id']);
  const d = parse(undoInput, input, 'undo');
  const S = who.storeId;
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const imp = await tx.legacyImport.findFirst({ where: { id, storeId: S }, select: { id: true, undoneAt: true } });
    if (!imp) throw new CustomersError('NOT_FOUND', 'no such import', ['id']);
    if (imp.undoneAt) throw new CustomersError('ALREADY_UNDONE', 'this import was undone already', ['id'], { undoneAt: imp.undoneAt });
    const records = await tx.legacyOrderRecord.updateMany({ where: { storeId: S, importId: id, archivedAt: null }, data: { archivedAt: now } });
    const made = await tx.customer.findMany({
      where: { storeId: S, legacyImportId: id, archivedAt: null, erasedAt: null },
      select: { id: true, mergedIntoId: true, orderCount: true, _count: { select: { orders: true } } },
    });
    const ids = made.map((c) => c.id);
    const [members, others] = await Promise.all([
      tx.customer.findMany({ where: { storeId: S, mergedIntoId: { in: ids } }, select: { mergedIntoId: true } }),
      tx.legacyOrderRecord.findMany({ where: { storeId: S, customerId: { in: ids }, archivedAt: null }, select: { customerId: true }, distinct: ['customerId'] }),
    ]);
    const keep = new Set([...members.map((m) => m.mergedIntoId!), ...others.map((o) => o.customerId!)]);
    const gone = made.filter((c) => !c.mergedIntoId && c.orderCount === 0 && c._count.orders === 0 && !keep.has(c.id)).map((c) => c.id);
    if (gone.length) await tx.customer.updateMany({ where: { id: { in: gone } }, data: { archivedAt: now } });
    await tx.legacyImport.update({ where: { id }, data: { undoneAt: now, undoneById: who.actor.staffUserId ?? null } });
    const result = { records: records.count, profilesArchived: gone.length, profilesKept: made.length - gone.length };
    await audit(tx, who.actor, { storeId: S, action: 'customers.legacyImport.undo', entityType: 'LegacyImport', entityId: id, before: null, after: { ...result, reason: d.reason ?? null } }, who.ctx);
    return result;
  }, TX);
}

export interface LegacyHistory {
  /** One of the person's profiles was made by an import (not undone). */
  imported: boolean;
  orders: number;
  outcomes: Record<LegacyOutcome, number>;
  firstAt: Date | null;
  lastAt: Date | null;
}

/** The old shop's orders of one person (his profiles' ids, the survivor's first) for his page (`customers.read`); null
 * when he has none and no import made him. */
export async function legacyHistory(deps: CustomersDeps, who: Who, profileIds: readonly string[]): Promise<LegacyHistory | null> {
  await allow(deps, who, 'customers.read');
  const S = who.storeId;
  const ids = profileIds.filter((x) => UUID.test(x));
  if (!ids.length) return null;
  const [groups, span, profiles] = await Promise.all([
    deps.db.legacyOrderRecord.groupBy({ by: ['outcome'], where: { storeId: S, customerId: { in: ids }, archivedAt: null }, _count: { _all: true } }),
    deps.db.legacyOrderRecord.aggregate({ where: { storeId: S, customerId: { in: ids }, archivedAt: null }, _min: { orderedAt: true }, _max: { orderedAt: true } }),
    deps.db.customer.findMany({ where: { storeId: S, id: { in: ids }, legacyImportId: { not: null }, archivedAt: null }, select: { legacyImportId: true } }),
  ]);
  const importIds = [...new Set(profiles.map((c) => c.legacyImportId!))];
  const made = importIds.length ? await deps.db.legacyImport.count({ where: { storeId: S, id: { in: importIds }, undoneAt: null } }) : 0;
  const outcomes = Object.fromEntries(LEGACY_OUTCOMES.map((o) => [o, 0])) as Record<LegacyOutcome, number>;
  for (const g of groups) if ((LEGACY_OUTCOMES as readonly string[]).includes(g.outcome)) outcomes[g.outcome as LegacyOutcome] += g._count._all;
  const orders = LEGACY_OUTCOMES.reduce((n, o) => n + outcomes[o], 0);
  if (!orders && !made) return null;
  return { imported: made > 0, orders, outcomes, firstAt: span._min.orderedAt, lastAt: span._max.orderedAt };
}
