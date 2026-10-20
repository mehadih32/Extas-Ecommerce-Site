// A SmartRule row ↔ the engine's Rule. The row keeps the live version in its columns and the candidate in `draft`; a
// version row (SmartRuleVersion) keeps the whole content as its snapshot. Reading never trusts stored JSON blindly:
// a row that does not parse any more (a hand edit in the database) is shown as broken, never used by the engine.
import type { Prisma } from '@extas/db/client';
import { ALL_SCOPE, ALWAYS, ruleContentSchema, type Rule, type RuleContent } from './model';

export type RuleRow = Prisma.SmartRuleGetPayload<object>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The live content of a row, as stored (may fail to parse). */
export function rowContent(row: RuleRow): unknown {
  return {
    key: row.key,
    kind: row.kind,
    nameEn: row.nameEn,
    ...(row.nameBn ? { nameBn: row.nameBn } : {}),
    text: row.text ?? {},
    params: row.params ?? [],
    scope: row.scope ?? ALL_SCOPE,
    conditions: row.conditions ?? ALWAYS,
    actions: row.actions ?? [],
    placements: row.placements,
    priority: row.priority,
    stackable: row.stackable,
    status: row.status,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
  };
}

export function parseContent(raw: unknown): RuleContent | null {
  const r = ruleContentSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** The row as the engine sees it; null when the stored content does not parse. */
export function toRule(row: RuleRow): Rule | null {
  const c = parseContent(rowContent(row));
  return c ? { ...c, id: row.id, version: row.version, archived: row.archivedAt !== null } : null;
}

/** The draft as a Rule (same id), or null. */
export function draftRule(row: RuleRow): Rule | null {
  const c = row.draft ? parseContent(row.draft) : null;
  return c ? { ...c, id: row.id, version: row.version + 1, archived: row.archivedAt !== null } : null;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** The columns that hold a content (for create / publish). */
export function contentColumns(c: RuleContent) {
  return {
    key: c.key,
    kind: c.kind,
    nameEn: c.nameEn,
    nameBn: c.nameBn ?? null,
    text: json(c.text),
    params: json(c.params),
    scope: json(c.scope),
    conditions: json(c.conditions),
    actions: json(c.actions),
    placements: c.placements,
    priority: c.priority,
    stackable: c.stackable,
    status: c.status,
    startsAt: c.startsAt ? new Date(c.startsAt) : null,
    endsAt: c.endsAt ? new Date(c.endsAt) : null,
  };
}

export const asJson = json;
