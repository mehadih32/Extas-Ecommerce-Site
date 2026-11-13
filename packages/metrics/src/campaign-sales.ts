// S28 · PR 699 — delivered sales and delivered order count per ad campaign over a period (the Sales rule: the order total on
// the day it was delivered). Read only, store-scoped; the Marketing overview's "sales per Tk 1" table reads it so no page adds
// up order money itself.
import type { Db } from './metrics';

export async function deliveredSalesByCampaign(db: Db, storeId: number, period: { from: Date; to: Date }): Promise<Map<string, { salesMinor: number; delivered: number }>> {
  const rows = await db.order.groupBy({
    by: ['adCampaignId'],
    where: { storeId, status: 'DELIVERED', adCampaignId: { not: null }, deliveredAt: { gte: period.from, lt: period.to } },
    _sum: { totalMinor: true },
    _count: { _all: true },
  });
  return new Map(rows.filter((r) => r.adCampaignId !== null).map((r) => [r.adCampaignId as string, { salesMinor: r._sum.totalMinor ?? 0, delivered: r._count._all }]));
}
