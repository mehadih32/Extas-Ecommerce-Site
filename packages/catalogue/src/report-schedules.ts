// S28 · PR 690 (admin prototype v5, Reports › Report packs) — when a pack goes to the owner by itself. One row per pack and store
// (`ReportSchedule`, reportKey `pack:<id>`): weekly (Monday) or monthly (the 1st), the channels asked for, and a switch (off as
// shipped). The nightly job sends a short Telegram summary of the period to the owner when a schedule is due, once per period
// (`lastSentAt`). The PDF and spreadsheet are downloaded on the page; e-mail is stored as a wish but not sent yet.
// Never sends to a buyer or a supplier. Needs `reports.read` (a pack is the person's own convenience).
import { requirePermission } from '@extas/auth';
import { z } from 'zod';
import { CatalogueError } from './errors';
import { parse, type CatalogueDeps, type Who } from './context';

export const PACK_IDS = ['monthly', 'bank', 'stock', 'sales'] as const;
export const SCHEDULE_FREQUENCIES = ['weekly', 'monthly'] as const;
export const SCHEDULE_CHANNELS = ['telegram', 'email'] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

const input = z
  .object({
    pack: z.enum(PACK_IDS),
    frequency: z.enum(SCHEDULE_FREQUENCIES),
    channels: z.array(z.enum(SCHEDULE_CHANNELS)).max(2),
    enabled: z.boolean(),
  })
  .strict();
export type SaveScheduleInput = z.input<typeof input>;

export interface ScheduleRow {
  pack: (typeof PACK_IDS)[number];
  frequency: ScheduleFrequency;
  channels: string[];
  enabled: boolean;
  lastSentAt: string | null;
}

const KEY = 'pack:';

/** The period a schedule is due for now, or null: weekly on Monday (key `W:<that Monday>`), monthly on the 1st (key `M:<month>`), shop time. */
export function scheduleDue(frequency: ScheduleFrequency, today: string): string | null {
  const d = new Date(`${today}T00:00:00Z`);
  if (frequency === 'weekly') return d.getUTCDay() === 1 ? `W:${today}` : null;
  return today.endsWith('-01') ? `M:${today.slice(0, 7)}` : null;
}

/** The schedule of each pack (those never saved are off). */
export async function listSchedules(deps: CatalogueDeps, who: Who): Promise<ScheduleRow[]> {
  await requirePermission(deps.db, who.actor, 'reports.read', { storeId: who.storeId });
  const rows = await deps.db.reportSchedule.findMany({ where: { storeId: who.storeId, reportKey: { startsWith: KEY } } });
  const by = new Map(rows.map((r) => [r.reportKey.slice(KEY.length), r]));
  return PACK_IDS.map((pack) => {
    const r = by.get(pack);
    return {
      pack,
      frequency: (r?.frequency as ScheduleFrequency | undefined) ?? 'monthly',
      channels: r?.channels ?? ['telegram'],
      enabled: r?.enabled ?? false,
      lastSentAt: r?.lastSentAt?.toISOString() ?? null,
    };
  });
}

/** Saves one pack's schedule. */
export async function saveSchedule(deps: CatalogueDeps, who: Who, raw: SaveScheduleInput): Promise<ScheduleRow[]> {
  await requirePermission(deps.db, who.actor, 'reports.read', { storeId: who.storeId });
  const d = parse(input, raw, 'schedule');
  if (d.enabled && d.channels.length === 0) throw new CatalogueError('INVALID_INPUT', 'pick where it goes', ['channels']);
  const key = `${KEY}${d.pack}`;
  await deps.db.reportSchedule.upsert({
    where: { storeId_reportKey: { storeId: who.storeId, reportKey: key } },
    create: { storeId: who.storeId, reportKey: key, frequency: d.frequency, channels: d.channels, enabled: d.enabled },
    update: { frequency: d.frequency, channels: d.channels, enabled: d.enabled },
  });
  return listSchedules(deps, who);
}
