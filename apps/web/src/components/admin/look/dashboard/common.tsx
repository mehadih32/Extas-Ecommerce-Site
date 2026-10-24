// PR 12 (CN-025) — what the Dashboard designs share: their props, the V12.4 page header (greeting, date, "live" time,
// the guide, the date choice, the CSV download and the "…" menu), the CSV of the figures on the page (one list for every
// design, so the three always agree), and small figure helpers (average order, sales per order) worked out from the
// metrics figures without adding any money up.
import type { ReactNode } from 'react';
import type { DashboardData, DashDesignSettings } from '@/lib/admin-look/dashboard-data';
import type { AdminView } from '@/lib/admin-page';
import type { ShellPlace, ShellViewer } from '@/lib/admin-shell/sections';
import { PlaceGuide } from '@/components/admin/shell/ShellParts';
import type { Fmt } from '../fmt';
import { CsvButton, LookMenu, type Csv, type LookMenuProps } from '../LookMenu';
import { RangeSeg, type RangeSegProps } from '../RangeSeg';

export interface DashHeadInfo {
  /** The greeting with the person's first name. */
  title: string;
  date: string;
  time: string;
  place: ShellPlace;
  range: RangeSegProps | null;
  menu: LookMenuProps;
  csv: Csv | null;
}

export interface DashProps {
  f: Fmt;
  view: AdminView;
  data: DashboardData;
  s: DashDesignSettings;
  viewer: ShellViewer;
  head: DashHeadInfo;
  /** `admin.dashboard.sparkDays`: days in the tiles' small lines. */
  sparkDays: number;
  /** The address's own choices (design B's view, a preview's design key). */
  q: { view?: string; design?: string };
  design: string;
}

export const can = (v: ShellViewer, ...keys: string[]) => v.owner || keys.some((k) => v.perms.has(k));

/** The average delivered order (goods value ÷ delivered orders), or null with none. */
export const aov = (k: { itemsMinor: number; orders: number }) => (k.orders > 0 ? Math.round(k.itemsMinor / k.orders) : null);

/** "vs the 7 days before" / "vs yesterday" in the admin's language. */
export function prevText(f: Fmt, d: DashboardData): string {
  return d.range.days === 1 && d.range.kind === 'preset' ? f.t('dsh.vsYesterday') : f.t('dsh.vsBefore', { n: f.n(d.range.days) });
}

/** "last 7 days" / "today" / "12 Oct – 18 Oct". */
export function rangeText(f: Fmt, d: DashboardData): string {
  if (d.range.kind === 'custom') return f.t('dsh.rangeCustom', { from: f.day(d.range.from), to: f.day(d.range.to) });
  return d.range.days === 1 ? f.t('dsh.rangeToday') : f.t('dsh.rangeLast', { n: f.n(d.range.days) });
}

/** The figures on the page as a CSV (Settings-free: the same rows for every design). */
export function csvOf(f: Fmt, d: DashboardData, today: string): Csv | null {
  const rows: string[][] = [[f.t('dsh.csv.figure'), f.t('dsh.csv.value'), f.t('dsh.csv.note')]];
  const m = d.money;
  if (m) {
    rows.push([f.t('dsh.sales'), f.money(m.cur.sales.itemsMinor), f.t('dash.status.provisional')]);
    rows.push([f.t('dsh.ordered'), f.money(m.cur.ordered.valueMinor), f.t('dash.status.final')]);
    rows.push([f.t('dsh.ordersPlaced'), f.n(m.cur.ordered.orders), '']);
    rows.push([f.t('dsh.deliveredOrders'), f.n(m.cur.sales.orders), '']);
    const a = aov(m.cur.sales);
    rows.push([f.t('dsh.aov'), a === null ? '—' : f.money(a), f.t('dsh.aovNote')]);
  }
  if (d.delivery) rows.push([f.t('dsh.success'), f.pct(d.delivery.rate), f.t('dsh.lastDays', { n: f.n(d.delivery.days) })]);
  if (d.stages) rows.push([f.t('dsh.openOrders'), f.n(d.stages.open), '']);
  if (rows.length === 1) return null;
  rows.push([f.t('dsh.csv.range'), rangeText(f, d), `${d.range.from} – ${d.range.to}`]);
  return { name: f.t('dsh.csv.file', { day: today }), rows };
}

/** The V12.4 header: the greeting, the date and the live time, then the guide, a view switch, the dates, CSV and "…". */
export function DashHead({ p, title, sub, views }: { p: DashProps; title?: string; sub?: ReactNode; views?: ReactNode }) {
  const { f, head } = p;
  return (
    <div className="a3-ph2" data-testid="dash-head">
      <div>
        <h1>{title ?? head.title}</h1>
        <p className="a3-sub">
          <span>{head.date}</span>
          <span className="a3-sep" aria-hidden="true" />
          <span className="a3-live">{f.t('dsh.live', { time: head.time })}</span>
          {sub}
        </p>
      </div>
      <div className="a3-phr">
        <PlaceGuide view={p.view} place={head.place} />
        {views}
        {head.range ? <RangeSeg {...head.range} /> : null}
        {head.csv ? <CsvButton csv={head.csv} label={f.t('dsh.download')} /> : null}
        <LookMenu {...head.menu} />
      </div>
    </div>
  );
}

/** A small "comes with" card body for a figure whose store is not built yet. */
export function soonText(f: Fmt, stage: string, what: string): string {
  return f.t('dsh.soon', { what, stage: f.t(`dsh.stage.${stage}`) });
}

/** The tip under a figure that is provisional until the courier money is matched (S07/S08). */
export function provisionalTip(f: Fmt): string {
  return f.t('dsh.provisionalTip');
}
