// S29 · PR 758–760 (CN-054) — what the Reports › Geography map screen draws for the risk, money and stock, and demand and
// customers lenses: which columns each lens has, which of them the viewer has any figure for (a part the server left out
// is null everywhere, so its column is not drawn), and how a figure reads. Pure: no React, no database. The figures are the
// lenses' own (`geoRisk`, `geoMoney`, `geoDemand`); nothing here works one out, and no business number is typed here.
import type { LensResult } from "@extas/metrics";

export const DRAWN_LENSES = ["risk", "money", "demand"] as const;
export type DrawnLens = (typeof DRAWN_LENSES)[number];

/** How a figure reads: a count, money in minor units, a share (0–1) shown as per cent, or a number already in per cent. */
export type ColumnKind = "count" | "money" | "share" | "percent";
export interface LensColumn {
  key: string;
  kind: ColumnKind;
}

export const LENS_COLUMNS: Record<DrawnLens, readonly LensColumn[]> = {
  risk: [
    { key: "delivered", kind: "count" },
    { key: "returned", kind: "count" },
    { key: "returnRate", kind: "share" },
    { key: "refusedAtDoor", kind: "count" },
    { key: "refusedOurFault", kind: "count" },
    { key: "cancelled", kind: "count" },
    { key: "highRisk", kind: "count" },
    { key: "highRiskShare", kind: "share" },
    { key: "claims", kind: "count" },
    { key: "tickets", kind: "count" },
  ],
  money: [
    { key: "delivered", kind: "count" },
    { key: "salesMinor", kind: "money" },
    { key: "deliveryChargeMinor", kind: "money" },
    { key: "courierMinor", kind: "money" },
    { key: "deliveryGapMinor", kind: "money" },
    { key: "freeDeliveryOrders", kind: "count" },
    { key: "profitMinor", kind: "money" },
    { key: "marginPct", kind: "percent" },
    { key: "adSpendMinor", kind: "money" },
    { key: "roasPercent", kind: "percent" },
    { key: "pieces", kind: "count" },
  ],
  demand: [
    { key: "orders", kind: "count" },
    { key: "newCustomers", kind: "count" },
    { key: "repeatCustomers", kind: "count" },
    { key: "repeatShare", kind: "share" },
    { key: "wishlistNoSale", kind: "count" },
    { key: "searchesNoSale", kind: "count" },
    { key: "demandWithoutSales", kind: "count" },
  ],
};

/** The columns the viewer has at least one figure for (in the lens's own order). */
export function columnsShown(
  lens: DrawnLens,
  data: Pick<LensResult, "rows" | "total">,
): LensColumn[] {
  return LENS_COLUMNS[lens].filter(
    (c) =>
      data.total[c.key] != null ||
      data.rows.some((r) => r.figures[c.key] != null),
  );
}

export interface LensFormat {
  number: (n: number) => string;
  money: (minor: number) => string;
}

/** One figure as text: "—" for none (never 0 for a part nobody could read), a share as per cent with one decimal at most. */
export function lensCell(
  kind: ColumnKind,
  value: number | null | undefined,
  fmt: LensFormat,
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  switch (kind) {
    case "count":
      return fmt.number(value);
    case "money":
      return fmt.money(value);
    case "share":
      return `${fmt.number(Math.round(value * 1000) / 10)}%`; // hardcode-ok: a share to per cent with one decimal, a unit fact
    case "percent":
      return `${fmt.number(value)}%`;
  }
}
