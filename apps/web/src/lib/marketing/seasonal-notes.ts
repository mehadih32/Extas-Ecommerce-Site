// S13 · PR 280 follow-up 650 — Marketing › Seasonal home in the admin's bell: a note when a window starts (the home
// page now shows its look) and when it ends or is stopped (the home page is the owner's own again), for the people who
// may see marketing (`marketing.campaigns.read`), while both `marketing.seasonalHome` and its notes
// (`marketing.seasonalHome.notes`, off as shipped) are on, for `days` days. Read live from the windows, nothing is
// stored or sent; a window stopped before it started never showed, so it has no note. Each note opens the page.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import type { SeasonalHomeNotes, SeasonalHomeSettings } from '@extas/settings';
import type { LoginNote } from '../admin-security/login-notes';
import { adminDicts, type AdminLang } from '../admin-i18n';
import { t } from '../i18n';
import type { AppResolver } from '../settings';

/** The page the notes link to. */
export const SEASONAL_PAGE = '/admin/marketing/seasonal';
/** Most windows read at once (a list-length guard, not a business number). */
const MOST = 40; // hardcode-ok: a list-length guard
const DAY_MS = 86_400_000;

export interface NoteWindow {
  id: string;
  name: string;
  applyAt: Date;
  revertAt: Date | null;
  status: string;
  stoppedAt: Date | null;
}

export interface SeasonalEvent {
  id: string;
  kind: 'started' | 'ended' | 'stopped';
  name: string;
  at: Date;
}

/** The starts and ends (or stops) that happened in [from, now], newest first (pure). */
export function seasonalNoteEvents(rows: readonly NoteWindow[], from: Date, now: Date): SeasonalEvent[] {
  const inside = (d: Date | null): d is Date => !!d && d.getTime() >= from.getTime() && d.getTime() <= now.getTime();
  const out: SeasonalEvent[] = [];
  for (const w of rows) {
    const stopped = w.status !== 'SCHEDULED' && w.stoppedAt ? w.stoppedAt : null;
    // stopped before its start: it never showed
    if (stopped && stopped.getTime() <= w.applyAt.getTime()) continue;
    if (inside(w.applyAt)) out.push({ id: `seasonal-start-${w.id}`, kind: 'started', name: w.name, at: w.applyAt });
    const byStop = !!stopped && (!w.revertAt || stopped.getTime() < w.revertAt.getTime());
    const end = byStop ? stopped : w.revertAt;
    if (inside(end)) out.push({ id: `seasonal-end-${w.id}`, kind: byStop ? 'stopped' : 'ended', name: w.name, at: end });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** The bell's seasonal home notes (empty while either switch is off). */
export async function seasonalNotes(
  deps: { db: PrismaClient; resolver: AppResolver },
  lang: AdminLang,
  opts: { now?: Date; locale: string; timeZone: string },
): Promise<LoginNote[]> {
  const S = MOTHER_STORE_ID;
  const [home, notes] = (await Promise.all([deps.resolver.value('marketing.seasonalHome', { storeId: S }), deps.resolver.value('marketing.seasonalHome.notes', { storeId: S })])) as [SeasonalHomeSettings, SeasonalHomeNotes];
  if (!home.enabled || !notes.enabled) return [];
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - notes.days * DAY_MS);
  const span = { gte: from, lte: now };
  const rows = await deps.db.scheduledLayoutSwitch.findMany({
    where: { storeId: S, OR: [{ applyAt: span }, { revertAt: span }, { stoppedAt: span }] },
    orderBy: { applyAt: 'desc' },
    take: MOST,
    include: { snapshot: { select: { name: true } } },
  });
  const dict = adminDicts[lang];
  const when = new Intl.DateTimeFormat(opts.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: opts.timeZone });
  return seasonalNoteEvents(
    rows.map((r) => ({ id: r.id, name: r.snapshot.name, applyAt: r.applyAt, revertAt: r.revertAt, status: r.status, stoppedAt: r.stoppedAt })),
    from,
    now,
  ).map((e) => ({
    id: e.id,
    title: t(dict, `shell.ntf.seasonal.${e.kind}`),
    body: [e.name, when.format(e.at)].join(' · '),
    href: SEASONAL_PAGE,
    at: e.at.toISOString(),
  }));
}
