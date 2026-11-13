// S28 · PR 687 (admin prototype v5, Finance › Money in & out) — the cashbook: where the shop's own money sits, by account
// (Cash, Bank, bKash, Nagad), and every movement of it. A RECORD only: nothing here sends, pays or collects money.
//   - Accounts are made on first use (Cash, Bank, bKash, Nagad); the owner may add more. An account is archived, never deleted.
//   - `recordCash` writes one signed entry (in +, out −) or a move between two accounts (two TRANSFER rows with one id), for
//     `cash.record` and the owner's PIN (the money rule: only Accounts and the owner record money). A request key makes a
//     double tap record once. Setting `books.cash.enabled` (on, the owner's written OK of 13 Nov) can stop all recording.
//   - Append-only: a wrong entry is put right by `reverseCash`, a new row that points at it (once; a move is reversed on both
//     accounts), never edited or deleted.
//   - `cashbookView` gives each account's balance, the month's money in and out (moves between own accounts not counted), the
//     movements newest first with the balance of that account after each, and the 14-day forecast (`cashForecast`, pure).
import type { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { BooksError } from './books-errors';
import { checkBooksPin, needPin } from './books-close';
import { addDays, fixedCostDays } from './books-rules';
import { logChange, nowOf, parse, setting, TX, type InventoryDeps, type Who } from './context';
import { allowBooks } from './erp-account';
import { storeDate } from './erp-events-pull';

/** The kinds a person may record. Kinds that only a source writes (a statement, a reversal) are not here. */
export const CASH_IN_KINDS = ['OPENING', 'CAPITAL', 'OTHER_IN', 'COURIER', 'ONLINE'] as const;
export const CASH_OUT_KINDS = ['OWNER_TAKE', 'OTHER_OUT', 'REFUND', 'EXPENSE', 'ADS', 'ERP'] as const;
export const CASH_RECORD_KINDS = [...CASH_IN_KINDS, ...CASH_OUT_KINDS, 'TRANSFER'] as const;
export type CashRecordKind = (typeof CASH_RECORD_KINDS)[number];

/** The accounts a store starts with: key, English name, Bengali name, kind. */
export const DEFAULT_CASH_ACCOUNTS = [
  { key: 'cash', nameEn: 'Cash', nameBn: 'ক্যাশ', kind: 'CASH' },
  { key: 'bank', nameEn: 'Bank', nameBn: 'ব্যাংক', kind: 'BANK' },
  { key: 'bkash', nameEn: 'bKash', nameBn: 'বিকাশ', kind: 'MOBILE' },
  { key: 'nagad', nameEn: 'Nagad', nameBn: 'নগদ', kind: 'MOBILE' },
] as const;

/** The most one entry holds (CashEntry.amountMinor is a 32-bit integer). */
const AMOUNT_MAX = 2_147_483_647;
const dayText = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
  message: 'a day, YYYY-MM-DD',
});

const recordInput = z
  .object({
    kind: z.enum(CASH_RECORD_KINDS),
    accountKey: z.string().min(1).max(40),
    toAccountKey: z.string().min(1).max(40).nullish(),
    amountMinor: z.int().min(1).max(AMOUNT_MAX),
    day: dayText.nullish(),
    note: z.string().trim().max(300).nullish(),
    requestKey: z.string().min(8).max(80).nullish(),
    pin: z.string().max(64),
  })
  .strict();
export type RecordCashInput = z.input<typeof recordInput>;

const reverseInput = z
  .object({
    reason: z.string().trim().min(3).max(500),
    pin: z.string().max(64),
  })
  .strict();
export type ReverseCashInput = z.input<typeof reverseInput>;

const accountInput = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,29}$/),
    nameEn: z.string().trim().min(1).max(40),
    nameBn: z.string().trim().max(40).nullish(),
    kind: z.enum(['CASH', 'BANK', 'MOBILE']),
  })
  .strict();
export type AddCashAccountInput = z.input<typeof accountInput>;

// ---- pure: signs, month figures, forecast ---------------------------------------------------------------------------------

/** +1 for a kind that brings money in, −1 for one that sends it out, 0 for a move or a reversal (its sign is its own). */
export function cashSign(kind: string): 1 | -1 | 0 {
  if ((CASH_IN_KINDS as readonly string[]).includes(kind)) return 1;
  if ((CASH_OUT_KINDS as readonly string[]).includes(kind)) return -1;
  return 0;
}

export interface CashRow {
  kind: string;
  amountMinor: number;
  /** For a REVERSAL: the kind of the entry it reverses (so it counts on the same side). */
  reversesKind?: string | null;
}

/**
 * Money in and out of a period, from its rows. Moves between the shop's own accounts and opening balances are not money in or
 * out. A reversal takes its amount off the side of what it reversed, so a wrong entry puts the month right.
 */
export function cashMonth(rows: readonly CashRow[]): {
  inMinor: number;
  outMinor: number;
} {
  let inMinor = 0;
  let outMinor = 0;
  for (const r of rows) {
    const kind = r.kind === 'REVERSAL' ? (r.reversesKind ?? '') : r.kind;
    if (kind === 'TRANSFER' || kind === 'OPENING' || kind === '') continue;
    const side = cashSign(kind);
    if (side === 1)
      inMinor += r.amountMinor; // a reversal of an "in" is negative, so it lowers "in"
    else if (side === -1) outMinor -= r.amountMinor; // out entries are negative; a reversal of one is positive, so it lowers "out"
  }
  return { inMinor, outMinor };
}

export interface ForecastInput {
  /** The store's today, YYYY-MM-DD. */
  today: string;
  days: number;
  /** All the cashbook's accounts together. */
  openingMinor: number;
  /** Cash couriers collected and have not paid over yet. */
  codHeldMinor: number;
  /** It reaches the shop evenly over this many days from tomorrow (0 = tomorrow). */
  codPayoutDays: number;
  /** Fixed costs of each day (month's fixed costs spread by the ERP's rule); a day without one costs nothing here. */
  fixedByDay: ReadonlyMap<string, number>;
}

export interface ForecastDay {
  day: string;
  inMinor: number;
  outMinor: number;
  balanceMinor: number;
}

export interface CashForecast {
  days: ForecastDay[];
  /** The day the balance is lowest (the first of them), and how low. */
  tightest: { day: string; balanceMinor: number } | null;
  /** Fixed costs inside the period, and whether the balance never goes below nothing while paying them. */
  fixedMinor: number;
  fixedCovered: boolean;
}

/** A read-only calculation: the balance today, the couriers' cash arriving, the fixed costs going out. Never a promise. */
export function cashForecast(i: ForecastInput): CashForecast {
  const span = Math.max(0, Math.floor(i.days));
  const arrive = Math.max(1, Math.floor(i.codPayoutDays) + 1);
  const each = Math.floor(Math.max(0, i.codHeldMinor) / arrive);
  const rest = Math.max(0, i.codHeldMinor) - each * arrive;
  const out: ForecastDay[] = [];
  let balance = i.openingMinor;
  let fixed = 0;
  for (let n = 1; n <= span; n += 1) {
    const day = addDays(i.today, n);
    const inMinor = n <= arrive ? each + (n === arrive ? rest : 0) : 0;
    const outMinor = i.fixedByDay.get(day) ?? 0;
    balance += inMinor - outMinor;
    fixed += outMinor;
    out.push({ day, inMinor, outMinor, balanceMinor: balance });
  }
  const low = out.reduce<ForecastDay | null>((m, d) => (!m || d.balanceMinor < m.balanceMinor ? d : m), null);
  return {
    days: out,
    tightest: low ? { day: low.day, balanceMinor: low.balanceMinor } : null,
    fixedMinor: fixed,
    fixedCovered: out.every((d) => d.balanceMinor >= 0),
  };
}

/** The fixed costs (salary, rent …) of each day from `from` to `to`, from the months' latest versions. */
export async function fixedCostsByDay(db: Pick<Prisma.TransactionClient, 'erpFixedCostMonth'>, storeId: number, from: string, to: string): Promise<Map<string, number>> {
  const rows = await db.erpFixedCostMonth.findMany({
    where: {
      storeId,
      month: {
        gte: new Date(`${from.slice(0, 7)}-01T00:00:00Z`),
        lte: new Date(`${to.slice(0, 7)}-01T00:00:00Z`),
      },
    },
    orderBy: [{ month: 'asc' }, { version: 'desc' }],
    select: {
      month: true,
      salaryMinor: true,
      rentMinor: true,
      utilitiesMinor: true,
      otherMinor: true,
    },
  });
  const out = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of rows) {
    const month = r.month.toISOString().slice(0, 7);
    if (seen.has(month)) continue;
    seen.add(month);
    for (const d of fixedCostDays(month, {
      salary: Number(r.salaryMinor),
      rent: Number(r.rentMinor),
      utilities: Number(r.utilitiesMinor),
      other: Number(r.otherMinor),
    }))
      if (d.day >= from && d.day <= to) out.set(d.day, d.minor);
  }
  return out;
}

// ---- accounts -------------------------------------------------------------------------------------------------------------

type Db = InventoryDeps['db'];

/** The store's accounts, made on first use from the four defaults (idempotent). */
async function ensureAccounts(db: Db | Prisma.TransactionClient, storeId: number): Promise<void> {
  const have = await db.cashAccount.count({ where: { storeId } });
  if (have > 0) return;
  await db.cashAccount.createMany({
    data: DEFAULT_CASH_ACCOUNTS.map((a, i) => ({
      storeId,
      key: a.key,
      nameEn: a.nameEn,
      nameBn: a.nameBn,
      kind: a.kind,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
}

export interface CashAccountView {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  kind: string;
  archived: boolean;
  balanceMinor: number;
}

async function accountsOf(db: Db, storeId: number): Promise<CashAccountView[]> {
  await ensureAccounts(db, storeId);
  const [rows, sums] = await Promise.all([
    db.cashAccount.findMany({
      where: { storeId },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    }),
    db.cashEntry.groupBy({
      by: ['accountId'],
      where: { storeId },
      _sum: { amountMinor: true },
    }),
  ]);
  const bal = new Map(sums.map((s) => [s.accountId, s._sum.amountMinor ?? 0]));
  return rows.map((a) => ({
    id: a.id,
    key: a.key,
    nameEn: a.nameEn,
    nameBn: a.nameBn,
    kind: a.kind,
    archived: a.archivedAt != null,
    balanceMinor: bal.get(a.id) ?? 0,
  }));
}

/** Adds an account (Rocket, Petty cash …). Needs `cash.record`. */
export async function addCashAccount(deps: InventoryDeps, who: Who, input: AddCashAccountInput): Promise<CashAccountView> {
  await allowBooks(deps, who, 'cash.record');
  const d = parse(accountInput, input, 'cash account');
  await ensureAccounts(deps.db, who.storeId);
  const last = await deps.db.cashAccount.findFirst({
    where: { storeId: who.storeId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const exists = await deps.db.cashAccount.findUnique({
    where: { storeId_key: { storeId: who.storeId, key: d.key } },
  });
  if (exists) throw new BooksError('CONFLICT', 'an account with this key exists', ['key']);
  const row = await deps.db.cashAccount.create({
    data: {
      storeId: who.storeId,
      key: d.key,
      nameEn: d.nameEn,
      nameBn: d.nameBn ?? null,
      kind: d.kind,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  await logChange(deps.db, who, {
    action: 'cash.account.add',
    entityType: 'CashAccount',
    entityId: row.id,
    before: null,
    after: { key: row.key, nameEn: row.nameEn, kind: row.kind },
    storeId: who.storeId,
  });
  return {
    id: row.id,
    key: row.key,
    nameEn: row.nameEn,
    nameBn: row.nameBn,
    kind: row.kind,
    archived: false,
    balanceMinor: 0,
  };
}

// ---- recording ------------------------------------------------------------------------------------------------------------

export interface CashEntryView {
  id: string;
  day: string;
  kind: string;
  accountKey: string;
  amountMinor: number;
  note: string | null;
  /** The balance of that account after this entry. */
  balanceAfterMinor: number;
  /** This entry was reversed (by a later one), or is itself a reversal (of the entry named). */
  reversed: boolean;
  reversesId: string | null;
  transferId: string | null;
  reason: string | null;
  source: string;
}

async function enabled(deps: InventoryDeps, storeId: number): Promise<void> {
  if (!(await setting(deps, storeId, 'books.cash')).enabled) throw new BooksError('CASH_OFF', 'recording in the cashbook is switched off', ['books.cash.enabled']);
}

async function today(deps: InventoryDeps, storeId: number): Promise<string> {
  return storeDate(nowOf(deps), await setting(deps, storeId, 'store.timeZone'));
}

/** Records one entry, or a move between two accounts. Needs `cash.record` and the owner's PIN. A request key records once. */
export async function recordCash(deps: InventoryDeps, who: Who, input: RecordCashInput): Promise<{ entries: CashEntryView[]; repeated: boolean }> {
  await allowBooks(deps, who, 'cash.record');
  needPin(input?.pin);
  const d = parse(recordInput, input, 'cash entry');
  await enabled(deps, who.storeId);
  const todayDay = await today(deps, who.storeId);
  const day = d.day ?? todayDay;
  if (day > todayDay) throw new BooksError('INVALID_INPUT', 'a day in the future cannot be recorded', ['day']);
  await ensureAccounts(deps.db, who.storeId);
  const keys = [d.accountKey, ...(d.kind === 'TRANSFER' ? [d.toAccountKey ?? ''] : [])];
  if (d.kind === 'TRANSFER' && (!d.toAccountKey || d.toAccountKey === d.accountKey)) throw new BooksError('INVALID_INPUT', 'a move needs two different accounts', ['toAccountKey']);
  const accounts = await deps.db.cashAccount.findMany({
    where: { storeId: who.storeId, key: { in: keys }, archivedAt: null },
  });
  const byKey = new Map(accounts.map((a) => [a.key, a]));
  for (const k of keys) if (!byKey.has(k)) throw new BooksError('NOT_FOUND', 'no such account', [k]);
  if (d.requestKey) {
    const seen = await deps.db.cashEntry.findFirst({
      where: {
        storeId: who.storeId,
        requestKey: { in: [d.requestKey, `${d.requestKey}:to`] },
      },
      select: { id: true },
    });
    if (seen)
      return {
        entries: await viewEntries(deps.db, who.storeId, { ids: [seen.id] }),
        repeated: true,
      };
  }
  await checkBooksPin(deps, who, d.pin, `cash.${d.kind.toLowerCase()}`);
  const createdById = who.actor.staffUserId ?? null;
  const note = d.note?.trim() || null;
  const ids = await deps.db.$transaction(async (tx) => {
    const base = {
      storeId: who.storeId,
      day: new Date(`${day}T00:00:00Z`),
      note,
      createdById,
      source: 'manual',
    };
    if (d.kind === 'TRANSFER') {
      const transferId = crypto.randomUUID();
      const from = await tx.cashEntry.create({
        data: {
          ...base,
          accountId: byKey.get(d.accountKey)!.id,
          kind: 'TRANSFER',
          amountMinor: -d.amountMinor,
          transferId,
          requestKey: d.requestKey ?? null,
        },
      });
      const to = await tx.cashEntry.create({
        data: {
          ...base,
          accountId: byKey.get(d.toAccountKey!)!.id,
          kind: 'TRANSFER',
          amountMinor: d.amountMinor,
          transferId,
          requestKey: d.requestKey ? `${d.requestKey}:to` : null,
        },
      });
      await logChange(tx, who, {
        action: 'cash.transfer',
        entityType: 'CashEntry',
        entityId: transferId,
        before: null,
        after: {
          from: d.accountKey,
          to: d.toAccountKey,
          amountMinor: d.amountMinor,
          day,
        },
        storeId: who.storeId,
      });
      return [from.id, to.id];
    }
    const sign = cashSign(d.kind);
    const row = await tx.cashEntry.create({
      data: {
        ...base,
        accountId: byKey.get(d.accountKey)!.id,
        kind: d.kind,
        amountMinor: sign * d.amountMinor,
        requestKey: d.requestKey ?? null,
      },
    });
    await logChange(tx, who, {
      action: `cash.${d.kind.toLowerCase()}`,
      entityType: 'CashEntry',
      entityId: row.id,
      before: null,
      after: { account: d.accountKey, amountMinor: row.amountMinor, day },
      storeId: who.storeId,
    });
    return [row.id];
  }, TX);
  return {
    entries: await viewEntries(deps.db, who.storeId, { ids }),
    repeated: false,
  };
}

/** Puts a wrong entry right with a reversing one (once). A move is reversed on both accounts. Needs `cash.record` and the PIN. */
export async function reverseCash(deps: InventoryDeps, who: Who, entryId: string, input: ReverseCashInput): Promise<{ entries: CashEntryView[] }> {
  await allowBooks(deps, who, 'cash.record');
  needPin(input?.pin);
  const d = parse(reverseInput, input, 'reversal');
  await enabled(deps, who.storeId);
  const target = await deps.db.cashEntry.findFirst({
    where: { id: entryId, storeId: who.storeId },
  });
  if (!target) throw new BooksError('NOT_FOUND', 'no such entry', [entryId]);
  if (target.kind === 'REVERSAL' || target.kind === 'OPENING') throw new BooksError('NOT_ADJUSTABLE', 'a reversal or an opening balance is not reversed', [entryId]);
  const legs = target.transferId
    ? await deps.db.cashEntry.findMany({
        where: { storeId: who.storeId, transferId: target.transferId },
      })
    : [target];
  if (
    await deps.db.cashEntry.findFirst({
      where: {
        storeId: who.storeId,
        reversesId: { in: legs.map((l) => l.id) },
      },
      select: { id: true },
    })
  )
    throw new BooksError('ALREADY', 'this entry was already reversed', [entryId]);
  await checkBooksPin(deps, who, d.pin, 'cash.reverse');
  const todayDay = await today(deps, who.storeId);
  const ids = await deps.db.$transaction(async (tx) => {
    const made: string[] = [];
    for (const l of legs) {
      const r = await tx.cashEntry.create({
        data: {
          storeId: who.storeId,
          accountId: l.accountId,
          day: new Date(`${todayDay}T00:00:00Z`),
          kind: 'REVERSAL',
          amountMinor: -l.amountMinor,
          reversesId: l.id,
          reason: d.reason,
          note: l.note,
          transferId: l.transferId,
          createdById: who.actor.staffUserId ?? null,
          source: 'manual',
        },
      });
      made.push(r.id);
    }
    await logChange(tx, who, {
      action: 'cash.reverse',
      entityType: 'CashEntry',
      entityId: target.id,
      before: { amountMinor: target.amountMinor },
      after: { reversedBy: made, reason: d.reason },
      storeId: who.storeId,
    });
    return made;
  }, TX);
  return { entries: await viewEntries(deps.db, who.storeId, { ids }) };
}

// ---- reading --------------------------------------------------------------------------------------------------------------

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Entries with the balance of their account after each. `ids` = just those; else the newest `limit` (unfiltered, so balances are exact). */
async function viewEntries(db: Db, storeId: number, o: { ids?: string[]; limit?: number }): Promise<CashEntryView[]> {
  const accounts = await accountsOf(db, storeId);
  const keyOf = new Map(accounts.map((a) => [a.id, a.key]));
  const order = [{ day: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }];
  const rows = await db.cashEntry.findMany({
    where: { storeId, ...(o.ids ? { id: { in: o.ids } } : {}) },
    orderBy: order,
    ...(o.limit ? { take: o.limit } : {}),
  });
  // The balance after each row: start from the account's balance and take back every newer row of that account.
  const bal = new Map(accounts.map((a) => [a.id, a.balanceMinor]));
  let walk = rows;
  if (o.ids) {
    // Only some rows asked: walk every newer row too, for an exact balance.
    const oldest = rows.reduce((m, r) => (r.day < m.day || (r.day.getTime() === m.day.getTime() && r.createdAt < m.createdAt) ? r : m), rows[0]!);
    walk = rows.length
      ? await db.cashEntry.findMany({
          where: {
            storeId,
            OR: [{ day: { gt: oldest.day } }, { day: oldest.day, createdAt: { gte: oldest.createdAt } }],
          },
          orderBy: order,
        })
      : [];
  }
  const after = new Map<string, number>();
  for (const r of walk) {
    after.set(r.id, bal.get(r.accountId) ?? 0);
    bal.set(r.accountId, (bal.get(r.accountId) ?? 0) - r.amountMinor);
  }
  const ids = rows.map((r) => r.id);
  const reversedBy = await db.cashEntry.findMany({
    where: { storeId, reversesId: { in: ids } },
    select: { reversesId: true },
  });
  const reversed = new Set(reversedBy.map((r) => r.reversesId));
  return rows.map((r) => ({
    id: r.id,
    day: ymd(r.day),
    kind: r.kind,
    accountKey: keyOf.get(r.accountId) ?? '',
    amountMinor: r.amountMinor,
    note: r.note,
    balanceAfterMinor: after.get(r.id) ?? 0,
    reversed: reversed.has(r.id),
    reversesId: r.reversesId,
    transferId: r.transferId,
    reason: r.reason,
    source: r.source,
  }));
}

export interface CashbookView {
  enabled: boolean;
  today: string;
  accounts: CashAccountView[];
  totalMinor: number;
  month: { from: string; inMinor: number; outMinor: number };
  entries: CashEntryView[];
  /** More rows exist than were read. */
  more: boolean;
}

/** The cashbook page: balances, the month's money in and out, and the newest movements (`limit` ≤ 500). Needs `books.read`. */
export async function cashbookView(deps: InventoryDeps, who: Who, o: { limit?: number } = {}): Promise<CashbookView> {
  await allowBooks(deps, who, 'books.read');
  const limit = Math.min(500, Math.max(1, Math.floor(o.limit ?? 200)));
  const [cfg, todayDay] = await Promise.all([setting(deps, who.storeId, 'books.cash'), today(deps, who.storeId)]);
  const accounts = await accountsOf(deps.db, who.storeId);
  const from = `${todayDay.slice(0, 7)}-01`;
  const [entries, monthRows, total] = await Promise.all([
    viewEntries(deps.db, who.storeId, { limit: limit + 1 }),
    deps.db.cashEntry.findMany({
      where: {
        storeId: who.storeId,
        day: { gte: new Date(`${from}T00:00:00Z`) },
      },
      select: { kind: true, amountMinor: true, reversesId: true },
    }),
    deps.db.cashEntry.count({ where: { storeId: who.storeId } }),
  ]);
  const reversedKinds = new Map<string, string>();
  const ids = monthRows.map((r) => r.reversesId).filter((x): x is string => !!x);
  if (ids.length)
    for (const r of await deps.db.cashEntry.findMany({
      where: { storeId: who.storeId, id: { in: ids } },
      select: { id: true, kind: true },
    }))
      reversedKinds.set(r.id, r.kind);
  const month = cashMonth(
    monthRows.map((r) => ({
      kind: r.kind,
      amountMinor: r.amountMinor,
      reversesKind: r.reversesId ? (reversedKinds.get(r.reversesId) ?? null) : null,
    })),
  );
  return {
    enabled: cfg.enabled,
    today: todayDay,
    accounts,
    totalMinor: accounts.reduce((n, a) => n + a.balanceMinor, 0),
    month: { from, ...month },
    entries: entries.slice(0, limit),
    more: total > limit,
  };
}

/** The forecast for the next `books.cash.forecastDays` days from the cashbook, the couriers' cash and the fixed costs. Needs `books.read`. */
export async function cashbookForecast(deps: InventoryDeps, who: Who, codHeldMinor: number): Promise<CashForecast> {
  await allowBooks(deps, who, 'books.read');
  const cfg = await setting(deps, who.storeId, 'books.cash');
  const todayDay = await today(deps, who.storeId);
  const accounts = await accountsOf(deps.db, who.storeId);
  const fixedByDay = await fixedCostsByDay(deps.db, who.storeId, addDays(todayDay, 1), addDays(todayDay, cfg.forecastDays));
  return cashForecast({
    today: todayDay,
    days: cfg.forecastDays,
    openingMinor: accounts.filter((a) => !a.archived).reduce((n, a) => n + a.balanceMinor, 0),
    codHeldMinor,
    codPayoutDays: cfg.codPayoutDays,
    fixedByDay,
  });
}
