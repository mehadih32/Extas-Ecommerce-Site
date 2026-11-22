// S29 · PR 761 (CN-054) — what the advisor takes from the courier and coverage lens (PR 757): the places where another courier
// does better from the shop's own parcels (`hints.courier`) and the places with orders and no courier mapped (`hints.coverage`).
// Pure: it only reads the lens's own answer, never a courier record, and it changes nothing. Names of couriers come from the
// lens (`couriers`), the rates from its `details` and `rows`.
import type { CourierLensResponse } from "@extas/metrics";
import type { CourierHint, CoverageGap } from "./advisor-model";

/** The "better courier" findings of the lens as the advisor's hints (one per place the lens flagged `betterCourier`). */
export function courierHints(lens: CourierLensResponse): CourierHint[] {
  const names = new Map(lens.couriers.map((c) => [c.id, c.name]));
  const out: CourierHint[] = [];
  for (const row of lens.rows) {
    if (!row.flags.includes("betterCourier")) continue;
    const d = lens.details[row.areaId];
    if (!d?.best) continue;
    const current = d.mostUsedCourierId
      ? d.couriers.find((c) => c.courierId === d.mostUsedCourierId)
      : undefined;
    out.push({
      areaId: row.areaId,
      nameEn: lens.places[row.areaId]?.nameEn ?? row.areaId,
      nameBn: lens.places[row.areaId]?.nameBn ?? null,
      bestCourier: names.get(d.best.courierId) ?? d.best.courierId,
      bestRate: d.best.successRate,
      currentRate: current?.successRate ?? null,
      settled: row.figures.parcels ?? d.best.parcels,
    });
  }
  return out;
}

/** The places with orders and no courier mapped. */
export function coverageGaps(lens: CourierLensResponse): CoverageGap[] {
  return lens.gaps.map((g) => ({
    areaId: g.areaId,
    nameEn: g.nameEn,
    nameBn: g.nameBn,
    orders: g.orders,
  }));
}
