// PR 192 — the courier performance report's rules without a database (BACKEND-ARCHITECTURE §5 REP-06, DLV-05a;
// SIM-F-017, SIM-F-018, SIM-F-027). One denominator everywhere: parcels with a final outcome (delivered, partly
// delivered or came back) in the period. On time is the same promise the customer's tracking page keeps (the order's
// band's most hours from placing, plus the owner's grace hours of `account.track.late`); a parcel whose band has no
// hours, or whose address the shop could not settle, has no promise and is left out of the on-time share — never
// counted as on time. Refused means it came back from the door (refused, or only the charge paid) and was not the
// shop's own fault (SIM-F-044). A rate with nothing under it is null ("—"), never 0 %.
import { EXCEPTION_STATUSES, type ShipmentStatus } from './pure';
import type { RtoCost } from './pure';

const HOUR = 3_600_000;

export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

/** One finished parcel as the report reads it. */
export interface PerfParcel {
  courierAccountId: string;
  courier: string;
  zoneKey: string | null;
  zoneName: string | null;
  district: string | null;
  status: ShipmentStatus;
  placedAt: Date;
  deliveredAt: Date | null;
  hoursMax: number | null;
  addressUnclear: boolean;
  /** Came back from the door and not the shop's own fault. */
  refused: boolean;
  /** The exception states the parcel went through on its way (a failed try, an address problem, lost, damaged). */
  exceptions: readonly ExceptionStatus[];
}

export interface PerfLine {
  key: string;
  label: string;
  /** Parcels with a final outcome. */
  parcels: number;
  delivered: number;
  /** Delivered parcels that had a promise (the on-time share's denominator). */
  promised: number;
  onTime: number;
  late: number;
  returned: number;
  refused: number;
  exceptions: Record<ExceptionStatus, number>;
  successRate: number | null;
  onTimeRate: number | null;
  returnRate: number | null;
  refusalRate: number | null;
}

const DELIVERED: ReadonlySet<string> = new Set(['DELIVERED', 'PARTIALLY_DELIVERED']);

/** Whether a delivered parcel kept its promise: null when it had none (or was not delivered). */
export function onTimeOf(p: Pick<PerfParcel, 'status' | 'placedAt' | 'deliveredAt' | 'hoursMax' | 'addressUnclear'>, graceHours: number): boolean | null {
  if (!DELIVERED.has(p.status) || !p.deliveredAt) return null;
  if (p.hoursMax === null || p.hoursMax <= 0 || p.addressUnclear) return null;
  return p.deliveredAt.getTime() <= p.placedAt.getTime() + (p.hoursMax + Math.max(0, graceHours)) * HOUR;
}

const rate = (n: number, of: number): number | null => (of > 0 ? n / of : null);

/** The counts and rates of a set of finished parcels. */
export function perfLine(key: string, label: string, parcels: readonly PerfParcel[], graceHours: number): PerfLine {
  const exceptions = Object.fromEntries(EXCEPTION_STATUSES.map((s) => [s, 0])) as Record<ExceptionStatus, number>;
  let delivered = 0;
  let promised = 0;
  let onTime = 0;
  let returned = 0;
  let refused = 0;
  for (const p of parcels) {
    if (DELIVERED.has(p.status)) delivered += 1;
    if (p.status === 'RETURNED') returned += 1;
    if (p.status === 'RETURNED' && p.refused) refused += 1;
    const ok = onTimeOf(p, graceHours);
    if (ok !== null) {
      promised += 1;
      if (ok) onTime += 1;
    }
    for (const s of new Set(p.exceptions)) exceptions[s] += 1;
  }
  const n = parcels.length;
  return {
    key,
    label,
    parcels: n,
    delivered,
    promised,
    onTime,
    late: promised - onTime,
    returned,
    refused,
    exceptions,
    successRate: rate(delivered, n),
    onTimeRate: rate(onTime, promised),
    returnRate: rate(returned, n),
    refusalRate: rate(refused, n),
  };
}

/** The parcels split by a key (most parcels first, then by label); a parcel with no key goes under `none`. */
export function groupPerf(parcels: readonly PerfParcel[], by: (p: PerfParcel) => { key: string; label: string } | null, graceHours: number, none = { key: '-', label: '' }): PerfLine[] {
  const groups = new Map<string, { label: string; rows: PerfParcel[] }>();
  for (const p of parcels) {
    const k = by(p) ?? none;
    const g = groups.get(k.key) ?? { label: k.label, rows: [] };
    g.rows.push(p);
    groups.set(k.key, g);
  }
  return [...groups.entries()].map(([key, g]) => perfLine(key, g.label, g.rows, graceHours)).sort((a, b) => b.parcels - a.parcels || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------------------------------------------------
// The RTO cost book's groups (CN-014 d): by district, campaign, product, courier and reason.

export const RTO_DIMENSIONS = ['district', 'campaign', 'product', 'courier', 'reason'] as const;
export type RtoDimension = (typeof RTO_DIMENSIONS)[number];

/** One returned parcel as the groups read it. `pieces`: its products with how many pieces of each. */
export interface RtoGroupInput {
  district: string | null;
  campaign: string | null;
  courier: string;
  reason: string | null;
  pieces: readonly { product: string; quantity: number }[];
  cost: Pick<RtoCost, 'knownMinor' | 'complete'>;
}

export interface RtoGroupLine {
  key: string;
  /** Parcels with this key (a parcel with two products counts under each). */
  parcels: number;
  /** The known cost put on this key; a parcel's cost is shared over its products by pieces. */
  knownMinor: number;
  /** Parcels here whose cost is not complete (a part the owner has not entered): the figure is a floor. */
  incomplete: number;
}

/** Splits an amount over weights in whole minor units (the remainder to the first ones), so the parts add up exactly. */
export function splitMinor(amount: number, weights: readonly number[]): number[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!weights.length) return [];
  if (total <= 0) return weights.map((_, i) => (i === 0 ? amount : 0));
  const parts = weights.map((w) => Math.floor((amount * Math.max(0, w)) / total));
  let left = amount - parts.reduce((s, x) => s + x, 0);
  for (let i = 0; left > 0; i = (i + 1) % parts.length, left -= 1) parts[i] = parts[i]! + 1;
  return parts;
}

/** The book grouped by one dimension: the groups' known costs add up to the book's known total. */
export function rtoGroups(rows: readonly RtoGroupInput[], dim: RtoDimension, none = '-'): RtoGroupLine[] {
  const out = new Map<string, RtoGroupLine>();
  const add = (key: string, minor: number, complete: boolean) => {
    const g = out.get(key) ?? { key, parcels: 0, knownMinor: 0, incomplete: 0 };
    g.parcels += 1;
    g.knownMinor += minor;
    if (!complete) g.incomplete += 1;
    out.set(key, g);
  };
  for (const r of rows) {
    if (dim === 'product') {
      const byProduct = new Map<string, number>();
      for (const p of r.pieces) byProduct.set(p.product, (byProduct.get(p.product) ?? 0) + Math.max(0, p.quantity));
      const names = [...byProduct.keys()];
      if (!names.length) {
        add(none, r.cost.knownMinor, r.cost.complete);
        continue;
      }
      const shares = splitMinor(r.cost.knownMinor, names.map((n) => byProduct.get(n)!));
      names.forEach((n, i) => add(n, shares[i]!, r.cost.complete));
      continue;
    }
    const key = (dim === 'district' ? r.district : dim === 'campaign' ? r.campaign : dim === 'courier' ? r.courier : r.reason) ?? none;
    add(key, r.cost.knownMinor, r.cost.complete);
  }
  return [...out.values()].sort((a, b) => b.knownMinor - a.knownMinor || b.parcels - a.parcels || a.key.localeCompare(b.key));
}

/** The campaign an order came from: its ad campaign's name (utm), else the channel it came in by. */
export const campaignOf = (o: { utmCampaign: string | null; source: string }): string => o.utmCampaign?.trim() || `source:${o.source}`;
