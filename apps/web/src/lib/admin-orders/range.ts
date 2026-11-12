// PR 660 (CN-048, admin prototype v5) — the date bar of the order lists (All orders, Processing, Cancelled …): the choices
// Today, Yesterday, Last 7 days, This month, Last month, and a custom range of two days. Days are the store's own
// calendar days as YYYY-MM-DD text (the order service reads them in `store.timeZone`); this file only counts days, so it
// has no time zone of its own and no database. The words are in messages/admin-orders.<lang>.json (`orders.list.date*`).

export type DatePreset = 'today' | 'yesterday' | 'days7' | 'month' | 'lastMonth';
export const DATE_PRESETS: readonly DatePreset[] = ['today', 'yesterday', 'days7', 'month', 'lastMonth'];

const DAY = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const text = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A real calendar day (YYYY-MM-DD) or nothing: 2026-02-30 is not a day. */
export function validDay(v: string | undefined): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const ms = parse(v);
  return Number.isFinite(ms) && text(ms) === v ? v : undefined;
}

/** The store's calendar day of a moment (`en-CA` writes it as YYYY-MM-DD). */
export const dayOf = (at: Date, timeZone: string): string => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/** The days each preset covers, counted from `today` (the store's own day). "Last 7 days" ends today and holds 7 days. */
export function presetRange(preset: DatePreset, today: string): { from: string; to: string } {
  const t = parse(today);
  const first = (y: number, m: number) => text(Date.UTC(y, m, 1));
  const d = new Date(t);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: text(t - DAY), to: text(t - DAY) };
    case 'days7':
      return { from: text(t - 6 * DAY), to: today };
    case 'month':
      return { from: first(d.getUTCFullYear(), d.getUTCMonth()), to: today };
    case 'lastMonth':
      return { from: first(d.getUTCFullYear(), d.getUTCMonth() - 1), to: text(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)) };
  }
}

/** The select's option value for a preset (`<from>..<to>`), which the page reads back as the two days. */
export const presetValue = (preset: DatePreset, today: string): string => {
  const r = presetRange(preset, today);
  return `${r.from}..${r.to}`;
};

/** Which preset the chosen days are, or '' (no days, or a custom range). */
export function presetOf(from: string | undefined, to: string | undefined, today: string): DatePreset | '' {
  if (!from || !to) return '';
  return DATE_PRESETS.find((p) => presetValue(p, today) === `${from}..${to}`) ?? '';
}
