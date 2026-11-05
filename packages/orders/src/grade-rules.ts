// S14 · PR 534 — customer grading, the pure part: a grade's rule (true deliveries at least, refusals not the shop's fault
// at most / at least) and which of the owner's grades a customer's counts earn. The grades are the owner's own
// CustomerGrade rows, in his order (`sortOrder`, lowest first); a customer gets the highest grade whose rule he meets,
// none when he meets none. The counts are the phone history's (true deliveries only; a refusal the shop caused never
// counts, SIM-F-044). A grade is a mark for the team: nothing here blocks, holds or changes cash on delivery.
import { z } from 'zod';

/** A grade's rule. `maxRefused` null: any number of refusals. Every number is the owner's. */
export const gradeCriteriaSchema = z
  .object({
    minDelivered: z.number().int().min(0).max(100_000),
    maxRefused: z.number().int().min(0).max(100_000).nullable(),
    minRefused: z.number().int().min(0).max(100_000),
  })
  .strict()
  .refine((c) => c.maxRefused === null || c.maxRefused >= c.minRefused, { message: 'maxRefused below minRefused', path: ['maxRefused'] });
export type GradeCriteria = z.output<typeof gradeCriteriaSchema>;

/** One of the owner's grades as the engine reads it. */
export interface GradeLevel {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  sortOrder: number;
  criteria: GradeCriteria;
}

/** What a grade is worked out from. */
export interface GradeCounts {
  delivered: number;
  refused: number;
}

/** A stored rule read back; a rule that no longer reads is no rule (that grade is never given). */
export function readCriteria(json: unknown): GradeCriteria | null {
  const r = gradeCriteriaSchema.safeParse(json);
  return r.success ? r.data : null;
}

/** The customer's counts meet the rule. */
export function meets(c: GradeCriteria, n: GradeCounts): boolean {
  return n.delivered >= c.minDelivered && n.refused >= c.minRefused && (c.maxRefused === null || n.refused <= c.maxRefused);
}

/** The owner's order: `sortOrder`, then the key (a stable tie-break). */
export function inOrder<T extends Pick<GradeLevel, 'sortOrder' | 'key'>>(levels: readonly T[]): T[] {
  return [...levels].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
}

/** The highest of the owner's grades whose rule the counts meet; null when none. */
export function pickGrade<T extends GradeLevel>(n: GradeCounts, levels: readonly T[]): T | null {
  const sorted = inOrder(levels);
  for (let i = sorted.length - 1; i >= 0; i--) if (meets(sorted[i]!.criteria, n)) return sorted[i]!;
  return null;
}

/** The grade is the owner's "good customer from" grade or above it in his order (false when that grade is not kept). */
export function atOrAbove(grade: Pick<GradeLevel, 'key' | 'sortOrder'> | null, fromKey: string, levels: readonly Pick<GradeLevel, 'key' | 'sortOrder'>[]): boolean {
  if (!grade || !fromKey) return false;
  const sorted = inOrder(levels);
  const from = sorted.findIndex((l) => l.key === fromKey);
  const at = sorted.findIndex((l) => l.key === grade.key);
  return from >= 0 && at >= from;
}

/** The verified mark: at least the owner's true deliveries (0 = no mark). */
export const isVerified = (delivered: number, verifiedMinDelivered: number): boolean => verifiedMinDelivered > 0 && delivered >= verifiedMinDelivered;

/** A grade's key from its English name: lower case, words joined by "-" (the owner never types a key). */
export function gradeKeyOf(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40)
      .replace(/^-+|-+$/g, '') || 'grade'
  );
}
