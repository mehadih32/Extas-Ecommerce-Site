// S28 · PR 1155 (the owner's ask: the prototype's full sample data in practice mode) — the prototype's money world on the SAMPLE
// store only: the four cashbook accounts with the prototype's names, about two months of money in and out (courier payouts,
// online payments, refunds, expenses, ad bills, ERP payments, the owner taking money), the shop's own staff with this month's
// pay (paid, due and late, with a bonus, a deduction and an advance) and the nine monthly cost heads of prototype v5.
//
// Why the sample store only (the same rule PR 880 set for ad spend): the cashbook, the salary list and the cost heads are read
// straight by Money in & out, Profit & loss, Costs & budgets and the Overview, which have no practice switch; on the owner's own
// store they would mix with real money. So every part checks first and does nothing when:
//  - the store is not the sample store (no `sample-catalogue` pack, or it already holds real orders), or
//  - the store already has any cashbook entry (never mixed with real books), or
//  - the salary list (`books.staffCosts`) is already set (never overwritten).
// Every figure the pages show is worked out by the real code from these rows (balances, month totals, net to pay, the per-order
// share): the seeder writes movements and the salary list, never a total. Deterministic: the same `now` gives the same rows.
import { staffCostsSchema, type StaffCostPerson } from '@extas/settings';
import type { Prisma, PrismaClient } from '@extas/db/client';
import { practiceId } from './ids';
import { SAMPLE_BOOKS, SAMPLE_EXTRAS } from './data';

type Db = PrismaClient;
const DAY = 86_400_000; // hardcode-ok: milliseconds in a day
const SAMPLE_PACK_KEY = 'sample-catalogue'; // hardcode-ok: the sample seed's marker (packages/seed/src/sample.ts)
const REAL_ORDERS_MAX = 20; // hardcode-ok: a store with more real orders than this is a working shop, never the sample store

/** True only for the sample store (its pack applied and almost no real orders): the one place sample money may be written. */
export async function isSampleStore(db: Db, storeId: number): Promise<boolean> {
  const [pack, real] = await Promise.all([
    db.defaultPackApplication.count({ where: { storeId, packKey: SAMPLE_PACK_KEY } }),
    db.order.count({ where: { storeId, isPractice: false } }),
  ]);
  return pack > 0 && real <= REAL_ORDERS_MAX;
}

function rngOf(seed: number) {
  let s = seed;
  const next = () => {
    s = (s * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return s / 4_294_967_296;
  };
  return { next, int: (a: number, b: number) => Math.floor(a + next() * (b - a + 1)) };
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const monthsBack = (d: Date, n: number) => monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1)));

/** Seeds the sample store's money world. Returns what it wrote (zeros when a guard stopped it). */
export async function seedSampleBooks(db: Db, storeId: number, minor: (taka: number) => number, now: Date): Promise<Record<string, number>> {
  const counts: Record<string, number> = { cashEntries: 0, staff: 0, payRows: 0 };
  if (!(await isSampleStore(db, storeId))) return counts;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = monthKey(today);
  const dayNow = today.getUTCDate();
  const B = SAMPLE_BOOKS;

  // ---- cashbook: the accounts with the prototype's names (only on a store with no account yet), then the movements
  const hasEntries = (await db.cashEntry.count({ where: { storeId } })) > 0;
  const entries: Prisma.CashEntryCreateManyInput[] = [];
  if (!hasEntries) {
    if ((await db.cashAccount.count({ where: { storeId } })) === 0)
      await db.cashAccount.createMany({ data: B.accounts.map((a, i) => ({ storeId, key: a.key, nameEn: a.nameEn, nameBn: a.nameBn, kind: a.kind, sortOrder: i })), skipDuplicates: true });
    const accounts = await db.cashAccount.findMany({ where: { storeId }, select: { id: true, key: true } });
    const acc = new Map(accounts.map((a) => [a.key, a.id]));
    const add = (key: string, d: Date, kind: Prisma.CashEntryCreateManyInput['kind'], taka: number, note: string) => {
      const accountId = acc.get(key);
      if (!accountId || !taka) return;
      const n = entries.length;
      entries.push({ id: practiceId(`cash:${storeId}:${n}`), storeId, accountId, day: d, kind, amountMinor: minor(taka), note, requestKey: `practice:cash:${n}`, source: 'practice', createdAt: new Date(d.getTime() + 12 * 3_600_000) }); // hardcode-ok: midday
    };
    const rng = rngOf(B.seed);
    const start = new Date(today.getTime() - B.days * DAY);
    for (const a of B.accounts) add(a.key, start, 'OPENING', a.opening, 'Opening balance (practice)');
    for (let i = B.days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY);
      for (const c of B.couriers) if (rng.next() < c.share) { const n = rng.int(2, 9); add('bank', d, 'COURIER', n * rng.int(c.perParcel[0]!, c.perParcel[1]!), `${c.name} · ${n} parcels`); }
      if (rng.next() < 0.7) { const n = rng.int(1, 3); add('bkash', d, 'ONLINE', n * rng.int(2_400, 3_600), `bKash · ${n} orders`); } // hardcode-ok: sample order values
      if (rng.next() < 0.45) { const n = rng.int(1, 2); add('bank', d, 'ONLINE', n * rng.int(1_800, 2_400), `Card · ${n} orders`); } // hardcode-ok: sample order values
      if (rng.next() < 0.25) add('nagad', d, 'ONLINE', rng.int(1_900, 4_200), 'Nagad · 1 order'); // hardcode-ok: sample order value
      if (rng.next() < 0.12) add('bkash', d, 'REFUND', -rng.int(900, 2_600), 'Refund to customer (practice)'); // hardcode-ok: sample refund
      if (rng.next() < 0.35) { const e = B.expenses[rng.int(0, B.expenses.length - 1)]!; add('cash', d, 'EXPENSE', -rng.int(e.taka[0]!, e.taka[1]!), e.note); }
      if (d.getUTCDay() === B.weekday) { add('bank', d, 'ERP', -B.erpPayment, 'Payment to ERP (practice)'); add('bank', d, 'ADS', -rng.int(B.adBill[0]!, B.adBill[1]!), 'Meta ad bill (practice)'); }
      if (d.getUTCDate() === B.ownerTakeDay) add('bank', d, 'OWNER_TAKE', -B.ownerTake, 'Owner took (practice)');
    }
  }

  // ---- the salary list and the monthly cost heads, unless the store already has one
  const set = await db.storeSettingValue.findUnique({ where: { storeId_key: { storeId, key: 'books.staffCosts' } }, select: { id: true } });
  const payRows: Prisma.StaffPayRowCreateManyInput[] = [];
  // the setting's definition is there on every real install (settings sync); without it nothing is written
  const defined = (await db.settingDefinition.count({ where: { key: 'books.staffCosts' } })) > 0;
  if (!set && defined) {
    const from = monthsBack(today, 6);
    const people: StaffCostPerson[] = [
      ...B.staff.map((p) => {
        const paid = p.paid && dayNow >= p.payDay;
        return {
          id: p.id,
          name: p.name,
          post: p.post,
          kind: 'salary' as const,
          payDay: p.payDay,
          amounts: [{ from, minor: minor(p.salary) }],
          stoppedFrom: null,
          ...(paid ? { paid: { [month]: { at: dayKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), p.payDay))), minor: minor(p.salary + (p.bonus ?? 0) - (p.ded ?? 0)), account: 'bank' } } } : {}),
        };
      }),
      ...B.heads.map((h) => ({ id: h.id, name: h.name, post: h.note ?? '', kind: h.kind, payDay: h.payDay, amounts: [{ from, minor: minor(h.taka) }], stoppedFrom: null })),
    ];
    const value = staffCostsSchema.parse({ people });
    await db.storeSettingValue.create({ data: { storeId, key: 'books.staffCosts', value: value as unknown as Prisma.InputJsonValue } });
    counts.staff = B.staff.length;
    // this month's bonus, deduction and advance (rows of their own, as Costs & budgets writes them), and the salaries paid
    for (const p of B.staff) {
      const payDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), Math.min(p.payDay, dayNow)));
      if (p.bonus) payRows.push({ id: practiceId(`payrow:${storeId}:${p.id}:bonus`), storeId, personId: p.id, month, kind: 'BONUS', amountMinor: minor(p.bonus), note: 'Practice' });
      if (p.ded) payRows.push({ id: practiceId(`payrow:${storeId}:${p.id}:ded`), storeId, personId: p.id, month, kind: 'DEDUCTION', amountMinor: minor(p.ded), note: 'Practice' });
      if (p.adv && !hasEntries) {
        const key = `practice:advance:${month}:${p.id}`;
        payRows.push({ id: practiceId(`payrow:${storeId}:${p.id}:adv`), storeId, personId: p.id, month, kind: 'ADVANCE', amountMinor: minor(p.adv), note: 'Practice', cashRequestKey: key, accountKey: 'cash' });
        const accountId = (await db.cashAccount.findUnique({ where: { storeId_key: { storeId, key: 'cash' } }, select: { id: true } }))?.id;
        if (accountId) entries.push({ id: practiceId(`cash:${storeId}:adv:${p.id}`), storeId, accountId, day: new Date(today.getTime() - 3 * DAY), kind: 'EXPENSE', amountMinor: -minor(p.adv), note: `Salary advance ${month} · ${p.name}`, requestKey: key, source: 'practice' });
      }
      if (p.paid && dayNow >= p.payDay && !hasEntries) {
        const accountId = (await db.cashAccount.findUnique({ where: { storeId_key: { storeId, key: 'bank' } }, select: { id: true } }))?.id;
        if (accountId) entries.push({ id: practiceId(`cash:${storeId}:salary:${p.id}`), storeId, accountId, day: payDate, kind: 'EXPENSE', amountMinor: -minor(p.salary + (p.bonus ?? 0) - (p.ded ?? 0)), note: `Salary ${month} · ${p.name}`, requestKey: `salary:${month}:${p.id}`, source: 'practice' });
      }
    }
    await db.staffPayRow.createMany({ data: payRows, skipDuplicates: true });
    counts.payRows = payRows.length;
  }
  await db.cashEntry.createMany({ data: entries, skipDuplicates: true });
  counts.cashEntries = entries.length;
  return counts;
}

/**
 * PR 1156: the prototype's customer questions (on practice products, so they go with the practice products on a reset and
 * show only while those products are on the shop) on any store with practice products; and, on the sample store only, the
 * prototype's marketing calendar plan lines (the owner's own calendar is never written on a working shop). Days are counted
 * from `now`, never fixed dates. Each part runs once (nothing is added when its rows are there).
 */
export async function seedSampleExtras(db: Db, storeId: number, now: Date): Promise<Record<string, number>> {
  const counts: Record<string, number> = { questions: 0, calendar: 0 };
  const products = await db.product.findMany({ where: { storeId, isPractice: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
  const qIds = SAMPLE_EXTRAS.questions.map((_, i) => practiceId(`question:${storeId}:${i}`));
  if (products.length && (await db.productQuestion.count({ where: { id: { in: qIds } } })) === 0) {
    const rows: Prisma.ProductQuestionCreateManyInput[] = SAMPLE_EXTRAS.questions.map((q, i) => {
      const at = new Date(now.getTime() - q.hoursAgo * 3_600_000); // hardcode-ok: milliseconds in an hour
      return { id: qIds[i]!, storeId, productId: products[q.product % products.length]!.id, question: q.text, answer: q.answer ?? null, answeredAt: q.answer ? at : null, status: q.answer ? 'APPROVED' : 'PENDING', createdAt: at, updatedAt: at };
    });
    await db.productQuestion.createMany({ data: rows, skipDuplicates: true });
    counts.questions = rows.length;
  }
  if (await isSampleStore(db, storeId)) {
    const cIds = SAMPLE_EXTRAS.calendar.map((_, i) => practiceId(`calendar:${storeId}:${i}`));
    if ((await db.calendarEntry.count({ where: { id: { in: cIds } } })) === 0) {
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const rows: Prisma.CalendarEntryCreateManyInput[] = SAMPLE_EXTRAS.calendar.map((c, i) => ({
        id: cIds[i]!,
        storeId,
        kind: 'plan',
        status: 'PLANNED',
        title: c.title,
        note: c.type,
        date: new Date(today.getTime() + c.from * DAY),
        endDate: c.to === c.from ? null : new Date(today.getTime() + c.to * DAY),
      }));
      await db.calendarEntry.createMany({ data: rows, skipDuplicates: true });
      counts.calendar = rows.length;
    }
  }
  return counts;
}
