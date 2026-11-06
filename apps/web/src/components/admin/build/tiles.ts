// PR 648 (CN-036) — Help & Build › Build progress: the four counts on top (in the plan, built, still to build, parked)
// as Lumen summary tiles (components/admin/lumen/SummaryTiles.tsx), the same numbers and notes as before.
import type { SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { formatCount, type CountFormat } from '@/lib/admin-lumen/model';
import type { ShellIconName } from '@/lib/admin-shell/icons';

export interface BuildCounts {
  prs: number;
  stages: number;
  live: number;
  merged: number;
  todo: number;
  parked: number;
}

/** `c` reads a `build.*` word with its values (the page's own reader). */
export function buildTiles(locale: string, n: BuildCounts, c: (k: string, vars?: Record<string, string | number>) => string): SummaryTile[] {
  const num: CountFormat = { kind: 'number', locale };
  const tile = (key: string, label: string, value: number, vs: string | undefined, icon: ShellIconName): SummaryTile => ({ key, label, value, shown: formatCount(value, num), format: num, vs, icon });
  return [
    tile('prs', c('kpi.prs'), n.prs, c('kpi.prsNote', { n: n.stages }), 'layers'),
    tile('done', c('kpi.done'), n.live + n.merged, c('kpi.doneNote', { live: n.live }), 'check'),
    tile('todo', c('kpi.todo'), n.todo, undefined, 'clock'),
    tile('parked', c('kpi.parked'), n.parked, c('kpi.parkedNote'), 'lock'),
  ];
}
