// S14 · PR 534 — customer grading (Customers › More › Customer settings, the "Grades & badges" card; demo V12.4
// 97u-adm2-customers.js a2Grade). The owner makes his own grades (CustomerGrade rows: a name in English and Bengali, a
// rule of true deliveries and refusals not the shop's fault, and their order); none is made for him. While his
// `customers.grades` is on, the team sees each customer's grade and verified mark, worked out live from the same counts
// the screen shows (@extas/orders grade-rules.ts). A run (the daily job, or "Grade everyone now") also writes each
// person's grade and verified date on his profile (Customer.gradeId / verifiedAt), which Marketing › Audiences reads.
// A grade is a mark for the team: it never blocks anyone, never holds an order and never changes cash on delivery.
// Nothing is deleted: a grade is archived and can come back.
import { audit, requirePermission } from '@extas/auth';
import { gradeCriteriaSchema, gradeKeyOf, gradingOf, historyOptions, inOrder, isVerified, markOf, readCriteria, type GradeCriteria, type GradeMark, type Grading } from '@extas/orders';
import { z } from 'zod';
import { allow, nowOf, parse, setting, TX, UUID, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';
import { peopleBaseSql } from './people-sql';

export type { GradeMark };

/** One of the owner's grades on the settings card. */
export interface GradeRow {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  /** Null when a stored rule no longer reads (that grade is never given until it is saved again). */
  criteria: GradeCriteria | null;
  sortOrder: number;
  archived: boolean;
  /** People holding it since the last run. */
  people: number;
}

export interface GradesScreen {
  enabled: boolean;
  maxGrades: number;
  grades: GradeRow[];
  canWrite: boolean;
}

/** The owner's grades (archived ones last) with the people holding each since the last run (`customers.read`). */
export async function gradesScreen(deps: CustomersDeps, who: Who): Promise<GradesScreen> {
  await allow(deps, who, 'customers.read');
  const S = who.storeId;
  const perms = await requirePermission(deps.db, who.actor, 'customers.read', { storeId: S });
  const [cfg, rows, held] = await Promise.all([
    setting(deps, S, 'customers.grades'),
    deps.db.customerGrade.findMany({ where: { storeId: S }, select: { id: true, key: true, nameEn: true, nameBn: true, criteria: true, sortOrder: true, archivedAt: true } }),
    deps.db.customer.groupBy({ by: ['gradeId'], where: { storeId: S, gradeId: { not: null }, mergedIntoId: null, erasedAt: null }, _count: { _all: true } }),
  ]);
  const count = new Map(held.map((h) => [h.gradeId, h._count._all]));
  const live = inOrder(rows.filter((r) => !r.archivedAt));
  const gone = inOrder(rows.filter((r) => r.archivedAt));
  return {
    enabled: cfg.enabled,
    maxGrades: cfg.maxGrades,
    grades: [...live, ...gone].map((r) => ({ id: r.id, key: r.key, nameEn: r.nameEn, nameBn: r.nameBn, criteria: readCriteria(r.criteria), sortOrder: r.sortOrder, archived: !!r.archivedAt, people: count.get(r.id) ?? 0 })),
    canWrite: perms.has('customers.settings'),
  };
}

const gradeInput = z
  .object({
    nameEn: z.string().trim().min(1).max(40),
    nameBn: z.string().trim().max(40).nullable().optional(),
    criteria: gradeCriteriaSchema,
    sortOrder: z.number().int().min(0).max(1_000),
  })
  .strict();

/** A new grade (`id` null) or a change to one (`customers.settings`; audited). Its key comes from the first English name
 * and stays, so the "good customer from" choice keeps pointing at it. */
export async function saveGrade(deps: CustomersDeps, who: Who, id: string | null, input: unknown): Promise<GradeRow> {
  await allow(deps, who, 'customers.settings');
  const d = parse(gradeInput, input, 'grade');
  const S = who.storeId;
  const cfg = await setting(deps, S, 'customers.grades');
  if (id !== null && !UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such grade', ['gradeId']);
  const data = { nameEn: d.nameEn, nameBn: d.nameBn || null, criteria: d.criteria, sortOrder: d.sortOrder };
  return deps.db.$transaction(async (tx) => {
    const same = await tx.customerGrade.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, nameEn: true } });
    if (same.some((x) => x.id !== id && x.nameEn.toLowerCase() === d.nameEn.toLowerCase())) throw new CustomersError('NAME_TAKEN', 'another grade has this name', ['nameEn']);
    let row;
    if (id === null) {
      if (same.length >= cfg.maxGrades) throw new CustomersError('LIMIT_REACHED', 'the store keeps its most grades already', ['customers.grades.maxGrades'], { max: cfg.maxGrades });
      const base = gradeKeyOf(d.nameEn);
      const taken = new Set((await tx.customerGrade.findMany({ where: { storeId: S, key: { startsWith: base } }, select: { key: true } })).map((x) => x.key));
      let key = base;
      for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;
      row = await tx.customerGrade.create({ data: { storeId: S, key, ...data } });
      await audit(tx, who.actor, { action: 'customer.grade.create', entityType: 'CustomerGrade', entityId: row.id, storeId: S, after: { key, ...data } }, who.ctx);
    } else {
      const before = await tx.customerGrade.findFirst({ where: { id, storeId: S } });
      if (!before) throw new CustomersError('NOT_FOUND', 'no such grade', ['gradeId']);
      row = await tx.customerGrade.update({ where: { id }, data });
      await audit(tx, who.actor, { action: 'customer.grade.update', entityType: 'CustomerGrade', entityId: id, storeId: S, before: { nameEn: before.nameEn, nameBn: before.nameBn, criteria: before.criteria, sortOrder: before.sortOrder }, after: data }, who.ctx);
    }
    return { id: row.id, key: row.key, nameEn: row.nameEn, nameBn: row.nameBn, criteria: readCriteria(row.criteria), sortOrder: row.sortOrder, archived: !!row.archivedAt, people: 0 };
  }, TX);
}

const archiveInput = z.object({ archived: z.boolean() }).strict();

/** Archives a grade or brings it back, never deleted (`customers.settings`; audited). The next run takes it off people. */
export async function archiveGrade(deps: CustomersDeps, who: Who, id: string, input: unknown): Promise<{ id: string; archived: boolean }> {
  await allow(deps, who, 'customers.settings');
  const d = parse(archiveInput, input, 'archive');
  if (!UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such grade', ['gradeId']);
  const S = who.storeId;
  const cfg = await setting(deps, S, 'customers.grades');
  return deps.db.$transaction(async (tx) => {
    const r = await tx.customerGrade.findFirst({ where: { id, storeId: S } });
    if (!r) throw new CustomersError('NOT_FOUND', 'no such grade', ['gradeId']);
    if (!!r.archivedAt === d.archived) return { id, archived: d.archived };
    if (!d.archived) {
      const live = await tx.customerGrade.findMany({ where: { storeId: S, archivedAt: null }, select: { nameEn: true } });
      if (live.length >= cfg.maxGrades) throw new CustomersError('LIMIT_REACHED', 'the store keeps its most grades already', ['customers.grades.maxGrades'], { max: cfg.maxGrades });
      if (live.some((x) => x.nameEn.toLowerCase() === r.nameEn.toLowerCase())) throw new CustomersError('NAME_TAKEN', 'another grade has this name', ['nameEn']);
    }
    await tx.customerGrade.update({ where: { id }, data: { archivedAt: d.archived ? nowOf(deps) : null } });
    await audit(tx, who.actor, { action: d.archived ? 'customer.grade.archive' : 'customer.grade.restore', entityType: 'CustomerGrade', entityId: id, storeId: S, before: { archivedAt: r.archivedAt }, after: { archived: d.archived } }, who.ctx);
    return { id, archived: d.archived };
  }, TX);
}

/** The store's grading while it is on (for the list and the customer page); null while off. */
export const customerGrading = (deps: CustomersDeps, storeId: number): Promise<Grading | null> => gradingOf(deps, storeId);

/** The grade and verified mark of these counts (null while grading is off). */
export const customerMark = (g: Grading | null, n: { delivered: number; refused: number }): GradeMark | null => (g ? markOf(g, n) : null);

export interface GradeRunStats {
  people: number;
  changed: number;
  verified: number;
}

/** One store's run: each person (the profile he stays under) gets the grade and verified date his counts earn now.
 * Null while grading is off (what was written stays as it is). Safe to run twice: only changes are written. */
export async function runGrades(deps: Pick<CustomersDeps, 'db' | 'settings' | 'now'>, storeId: number): Promise<GradeRunStats | null> {
  const g = await gradingOf(deps, storeId);
  if (!g) return null;
  const hist = await historyOptions(deps, storeId);
  const rows = await deps.db.$queryRaw<{ id: string; delivered: bigint | number; refused: bigint | number; gradeId: string | null; verifiedAt: Date | null }[]>`${peopleBaseSql(storeId, [...hist.ourFault])}
    SELECT b."id", b.delivered, b.refused, c."gradeId", c."verifiedAt" FROM base b JOIN "Customer" c ON c."id" = b."id"`;
  const ids = new Map(g.levels.map((l) => [l.key, l.id]));
  const moveTo = new Map<string | null, string[]>();
  const verify: string[] = [];
  const unverify: string[] = [];
  let verified = 0;
  for (const r of rows) {
    const n = { delivered: Number(r.delivered), refused: Number(r.refused) };
    const m = markOf(g, n);
    const want = m.grade ? (ids.get(m.grade.key) ?? null) : null;
    if (want !== r.gradeId) moveTo.set(want, [...(moveTo.get(want) ?? []), r.id]);
    if (m.verified) verified++;
    if (m.verified && !r.verifiedAt) verify.push(r.id);
    if (!isVerified(n.delivered, g.verifiedMinDelivered) && r.verifiedAt) unverify.push(r.id);
  }
  const now = nowOf(deps);
  const changed = new Set([...[...moveTo.values()].flat(), ...verify, ...unverify]).size;
  if (changed)
    await deps.db.$transaction(
      async (tx) => {
        for (const [gradeId, list] of moveTo) await tx.customer.updateMany({ where: { storeId, id: { in: list } }, data: { gradeId } });
        if (verify.length) await tx.customer.updateMany({ where: { storeId, id: { in: verify } }, data: { verifiedAt: now } });
        if (unverify.length) await tx.customer.updateMany({ where: { storeId, id: { in: unverify } }, data: { verifiedAt: null } });
      },
      TX,
    );
  return { people: rows.length, changed, verified };
}

/** "Grade everyone now" on the card (`customers.settings`; audited with the counts only). */
export async function runGradesNow(deps: CustomersDeps, who: Who): Promise<GradeRunStats> {
  await allow(deps, who, 'customers.settings');
  const r = await runGrades(deps, who.storeId);
  if (!r) throw new CustomersError('SWITCHED_OFF', 'customer grading is off', ['customers.grades.enabled']);
  await audit(deps.db, who.actor, { action: 'customer.grades.run', entityType: 'CustomerGrade', entityId: 'all', storeId: who.storeId, after: { ...r } }, who.ctx);
  return r;
}
