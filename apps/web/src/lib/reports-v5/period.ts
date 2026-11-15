// Prototype v5 parity (round 3) — the period buttons of every v5 report: Today, 7 days, 30 days, This month, Last month,
// 6 months, Custom dates. Pure date arithmetic on the shop's own day strings; no database.
import { addDays } from './model';

export const PROTO_PERIODS = ['today', 'd7', 'd30', 'month', 'lastMonth', 'm6', 'custom'] as const;
export type ProtoPeriod = (typeof PROTO_PERIODS)[number];
const LAST_DAYS = { d7: 7, d30: 30, m6: 182 } as const; // hardcode-ok: what the button names say (7 days, 30 days, 6 months)
type Sp = Record<string, string | string[] | undefined>;
const one = (sp: Sp, k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);

/** The two days a period button stands for. */
export function protoRange(p: Exclude<ProtoPeriod, 'custom'>, today: string): { from: string; to: string } {
  if (p === 'today') return { from: today, to: today };
  if (p === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (p === 'lastMonth') {
    const to = addDays(`${today.slice(0, 7)}-01`, -1);
    return { from: `${to.slice(0, 7)}-01`, to };
  }
  return { from: addDays(today, -(LAST_DAYS[p] - 1)), to: today };
}

/** Which button a period is: its own key from `p=`, else the one whose two days match, else "custom". */
export function protoKey(p: string | undefined, from: string, to: string, today: string): ProtoPeriod {
  if (PROTO_PERIODS.includes(p as ProtoPeriod)) return p as ProtoPeriod;
  for (const k of PROTO_PERIODS) {
    if (k === 'custom') continue;
    const r = protoRange(k, today);
    if (r.from === from && r.to === to) return k;
  }
  return 'custom';
}

/** The page's query with the prototype's default (30 days) when no period was asked for, and a button's key turned into its two days. */
export function withProtoPeriod(sp: Sp, today: string): Sp {
  const p = one(sp, 'p');
  if (p && p !== 'custom' && PROTO_PERIODS.includes(p as ProtoPeriod) && !one(sp, 'from') && !one(sp, 'to')) return { ...sp, ...protoRange(p as Exclude<ProtoPeriod, 'custom'>, today) };
  if (!one(sp, 'period') && !one(sp, 'from') && !one(sp, 'to')) return { ...sp, ...protoRange('d30', today), p: 'd30' };
  return sp;
}

/** The library's preset name for a button (saved views). */
export const PRESET_OF: Record<ProtoPeriod, string> = { today: 'today', d7: 'last7', d30: 'last30', month: 'month', lastMonth: 'lastmonth', m6: 'last6m', custom: 'custom' };
