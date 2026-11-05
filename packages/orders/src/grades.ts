// S14 · PR 534 — customer grading, the read: the owner's grades (CustomerGrade rows not archived, rules that read) while
// `customers.grades` is on, and the grade and verified mark a customer's counts earn (grade-rules.ts). Used by the
// good-customer override (good-customer.ts), Orders › To confirm (approval-history.ts) and the Customers screens.
import { setting, type OrdersDeps } from './context';
import { atOrAbove, inOrder, isVerified, pickGrade, readCriteria, type GradeCounts, type GradeLevel } from './grade-rules';

/** The grading as one store has it now; null while the owner's switch is off. */
export interface Grading {
  levels: GradeLevel[];
  verifiedMinDelivered: number;
  goodFrom: string;
}

/** What a customer's counts earn: his grade (null: none of the owner's grades) and the verified mark. */
export interface GradeMark {
  grade: Pick<GradeLevel, 'key' | 'nameEn' | 'nameBn'> | null;
  verified: boolean;
}

/** The store's grading while it is on (the grades in the owner's order); otherwise null. */
export async function gradingOf(deps: Pick<OrdersDeps, 'db' | 'settings'>, storeId: number): Promise<Grading | null> {
  const cfg = await setting(deps, storeId, 'customers.grades');
  if (!cfg.enabled) return null;
  const rows = await deps.db.customerGrade.findMany({ where: { storeId, archivedAt: null }, select: { id: true, key: true, nameEn: true, nameBn: true, sortOrder: true, criteria: true } });
  const levels = rows.flatMap((r) => {
    const criteria = readCriteria(r.criteria);
    return criteria ? [{ id: r.id, key: r.key, nameEn: r.nameEn, nameBn: r.nameBn, sortOrder: r.sortOrder, criteria }] : [];
  });
  return { levels: inOrder(levels), verifiedMinDelivered: cfg.verifiedMinDelivered, goodFrom: cfg.goodFrom };
}

/** The grade and mark these counts earn under the store's grading. */
export function markOf(g: Grading, n: GradeCounts): GradeMark {
  const grade = pickGrade(n, g.levels);
  return { grade: grade ? { key: grade.key, nameEn: grade.nameEn, nameBn: grade.nameBn } : null, verified: isVerified(n.delivered, g.verifiedMinDelivered) };
}

/** The counts earn a grade at or above the owner's "good customer from" grade (never while grading is off or it is empty). */
export function goodByGrade(g: Grading | null, n: GradeCounts): string | null {
  if (!g || !g.goodFrom) return null;
  const grade = pickGrade(n, g.levels);
  return grade && atOrAbove(grade, g.goodFrom, g.levels) ? grade.key : null;
}
