// S23 · PR 442 (Blueprint C5.3, C5.5 point 4 "Content calendar, approval queue, auto-schedule rules, per-platform
// limits") — an auto-schedule rule (`SocialScheduleRule`, the `SocialScheduleRule` table S23's own schema already
// carries): a cadence ("3 posts a day … plus 1 reel", Blueprint C5.3's own example), which weekdays it runs on, and
// which of the store's categories it draws from, optionally pinned to one account. Add, edit, switch on/off,
// archive/restore — never deleted, every change audited, the same shape as `accounts.ts` and `templates.ts`.
//
// Honest scope: this PR makes the rule itself real, editable and enforced for display (a per-rule "next active day"
// preview below) — exactly the same honest gap PR 307/308 (S15's per-agent model pick and schedule) shipped first:
// "no job runner reads this yet". Automatically choosing which products and template a rule's next post should use,
// queuing its render and sending it — the actual dispatcher — needs the real compositor (PR 439's own honest gap)
// and a background worker's cron slot (`packages/jobs`, not wired for this stage yet); building a fake automatic
// picker on top of two things that do not exist yet would only hide that gap, not close it. What PR 442 does enforce
// for real today is the **per-platform daily limit** (`SocialAccount.dailyLimit`, PR 437) and the **approval queue**
// and **calendar** (see `publish.ts`'s `decideSocialPost`/`studioCalendar`/`rescheduleSocialPost`/`publishDuePosts`).
import { z } from 'zod';
import { allow, checkStoreId, logChange, nowOf, parse, StudioError, type StudioDeps, type Who } from './context';
import { nextDay, weekdayOf, ymdIn } from './daykey';

const cadenceSchema = z
  .object({
    postsPerDay: z.number().int().min(0).max(20),
    reelsPerDay: z.number().int().min(0).max(10),
    // 0=Sunday … 6=Saturday (Blueprint's own week); empty means the rule never fires.
    activeWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
  })
  .strict();
export type ScheduleCadence = z.infer<typeof cadenceSchema>;

const CATEGORIES_MAX = 20; // hardcode-ok: a list-length guard on one rule, not a business number (CN-018).

export const addScheduleRuleInput = z
  .object({
    accountId: z.uuid().nullable().optional(),
    cadence: cadenceSchema,
    categoryIds: z.array(z.uuid()).max(CATEGORIES_MAX),
  })
  .strict();

export const saveScheduleRuleInput = z.discriminatedUnion('action', [
  addScheduleRuleInput.extend({ action: z.literal('add') }),
  z.object({ action: z.literal('edit'), id: z.uuid(), accountId: z.uuid().nullable().optional(), cadence: cadenceSchema, categoryIds: z.array(z.uuid()).max(CATEGORIES_MAX), version: z.string().max(40).optional() }).strict(),
  z.object({ action: z.literal('switch'), id: z.uuid(), enabled: z.boolean(), version: z.string().max(40).optional() }).strict(),
  z.object({ action: z.literal('archive'), id: z.uuid(), archived: z.boolean(), version: z.string().max(40).optional() }).strict(),
]);

export interface ScheduleRuleRow {
  id: string;
  accountId: string | null;
  cadence: ScheduleCadence;
  categoryIds: string[];
  enabled: boolean;
  archived: boolean;
  version: string;
  /** The next day on/after today this rule's own weekdays would fire — a preview only; see the header above. */
  nextActiveDay: string | null;
}

const DEFAULT_CADENCE: ScheduleCadence = { postsPerDay: 0, reelsPerDay: 0, activeWeekdays: [] };

function cadenceOf(j: unknown): ScheduleCadence {
  const r = cadenceSchema.safeParse(j);
  return r.success ? r.data : DEFAULT_CADENCE;
}

/** The next YYYY-MM-DD on or after `fromYmd` whose weekday is in `activeWeekdays` — `null` when the list is empty. */
export function nextActiveDayOf(activeWeekdays: readonly number[], fromYmd: string): string | null {
  if (!activeWeekdays.length) return null;
  let ymd = fromYmd;
  for (let i = 0; i < 7; i++) {
    if (activeWeekdays.includes(weekdayOf(ymd))) return ymd;
    ymd = nextDay(ymd);
  }
  return null;
}

type RuleRow = { id: string; accountId: string | null; cadence: unknown; categoryIds: string[]; enabled: boolean; archivedAt: Date | null; updatedAt: Date };

function rowOf(r: RuleRow, todayYmd: string): ScheduleRuleRow {
  const cadence = cadenceOf(r.cadence);
  return {
    id: r.id,
    accountId: r.accountId,
    cadence,
    categoryIds: r.categoryIds,
    enabled: r.enabled,
    archived: r.archivedAt !== null,
    version: r.updatedAt.toISOString(),
    nextActiveDay: r.enabled && r.archivedAt === null ? nextActiveDayOf(cadence.activeWeekdays, todayYmd) : null,
  };
}

/** The store's auto-schedule rules (`studio.read`), switched on first. */
export async function scheduleRules(deps: StudioDeps, who: Who): Promise<ScheduleRuleRow[]> {
  await allow(deps, who, 'studio.read');
  const tz = await deps.settings.value('store.timeZone', { storeId: who.storeId });
  const todayYmd = ymdIn(nowOf(deps), tz);
  const rows = await deps.db.socialScheduleRule.findMany({ where: { storeId: who.storeId }, orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { enabled: 'desc' }, { createdAt: 'asc' }] });
  return rows.map((r) => rowOf(r, todayYmd));
}

/** Adds, edits, switches on/off or archives/restores an auto-schedule rule (`studio.write`). Audited. */
export async function saveScheduleRule(deps: StudioDeps, who: Who, input: unknown): Promise<ScheduleRuleRow> {
  await allow(deps, who, 'studio.write');
  checkStoreId(who.storeId);
  const d = parse(saveScheduleRuleInput, input, 'schedule rule');
  const tz = await deps.settings.value('store.timeZone', { storeId: who.storeId });
  const todayYmd = ymdIn(nowOf(deps), tz);

  async function checkRefs(accountId: string | null | undefined, categoryIds: readonly string[]): Promise<void> {
    if (accountId) {
      const acc = await deps.db.socialAccount.findFirst({ where: { id: accountId, storeId: who.storeId } });
      if (!acc) throw new StudioError('NOT_FOUND', 'no such account', ['accountId']);
    }
    if (categoryIds.length) {
      const cats = await deps.db.category.findMany({ where: { storeId: who.storeId, id: { in: [...categoryIds] } }, select: { id: true } });
      const have = new Set(cats.map((c) => c.id));
      const missing = categoryIds.filter((id) => !have.has(id));
      if (missing.length) throw new StudioError('NOT_FOUND', 'a category in this rule is not in this store', missing);
    }
  }

  if (d.action === 'add') {
    await checkRefs(d.accountId, d.categoryIds);
    const made = await deps.db.socialScheduleRule.create({ data: { storeId: who.storeId, accountId: d.accountId ?? null, cadence: d.cadence, categoryIds: d.categoryIds, enabled: false } });
    await logChange(deps.db, who, { action: 'studio.rule.add', entityType: 'SocialScheduleRule', entityId: made.id, before: null, after: { accountId: made.accountId, cadence: d.cadence, categoryIds: d.categoryIds } });
    return rowOf(made, todayYmd);
  }
  const c = await deps.db.socialScheduleRule.findFirst({ where: { id: d.id, storeId: who.storeId } });
  if (!c) throw new StudioError('NOT_FOUND', 'no such rule', ['id']);
  if (d.version !== undefined && d.version !== c.updatedAt.toISOString()) throw new StudioError('STALE', 'the rule changed; read it again', ['version']);
  const before = rowOf(c, todayYmd);
  if (d.action === 'edit') await checkRefs(d.accountId, d.categoryIds);
  const data =
    d.action === 'edit'
      ? { accountId: d.accountId ?? null, cadence: d.cadence, categoryIds: d.categoryIds }
      : d.action === 'switch'
        ? { enabled: d.enabled }
        : { archivedAt: d.archived ? (c.archivedAt ?? nowOf(deps)) : null, ...(d.archived ? { enabled: false } : {}) };
  const after = await deps.db.socialScheduleRule.update({ where: { id: c.id }, data });
  await logChange(deps.db, who, { action: `studio.rule.${d.action}`, entityType: 'SocialScheduleRule', entityId: c.id, before, after: rowOf(after, todayYmd) });
  return rowOf(after, todayYmd);
}
