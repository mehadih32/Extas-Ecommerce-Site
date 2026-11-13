// S28 · PR 683 — /api/admin/products/<id>/erp-size-chart: the ERP's size chart for the product's style.
//   GET    where it stands (off · no style code · none yet · available · applied · newer)   `catalogue.read`
//   POST   {action: "fetch"}  asks the ERP's source (a sample until the ERP ships it) and keeps the chart   `catalogue.write`
//          {action: "use"}    makes the shop's own chart from it and gives it to the product            `catalogue.write`
// The catalogue service checks the switch (`catalogue.erpSizeChart`), the permission and the store again.
import * as cat from '@extas/catalogue';
import { erpSizeChartSource, ErpSizeChartNotShipped } from '@extas/adapters';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './catalogue-api';

export function productErpChartHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  const m = request.method.toUpperCase();
  if (!isUuid(id)) return Promise.resolve(fail(400, 'INVALID_INPUT', ['id']));
  if (m === 'GET') return handle(request, deps, 'catalogue.read', async (c) => ({ chart: await cat.erpChartView(c.deps, c.who, id) }));
  if (m !== 'POST') return Promise.resolve(fail(405, 'method-not-allowed'));
  return handle(request, deps, 'catalogue.write', async (c) => {
    const b = (await body(request)) as { action?: unknown } | null;
    if (b?.action === 'use') {
      const r = await cat.useErpChart(c.deps, c.who, id);
      return {
        chart: await cat.erpChartView(c.deps, c.who, id),
        made: { id: r.chart.id, name: r.chart.name, skippedFields: r.skippedFields, skippedSizes: r.skippedSizes, already: r.already },
      };
    }
    if (b?.action !== 'fetch') return fail(400, 'INVALID_INPUT', ['action']);
    const set = await c.deps.settings.value('catalogue.erpSizeChart', { storeId: c.who.storeId });
    if (!set.on) return fail(409, 'CONFLICT', ['ERP_CHART_OFF']);
    const view = await cat.erpChartView(c.deps, c.who, id);
    if (!view.styleCode) return fail(409, 'CONFLICT', ['NO_STYLE']);
    let payload;
    try {
      payload = await erpSizeChartSource(set.source).sizeChart(view.styleCode);
    } catch (e) {
      if (e instanceof ErpSizeChartNotShipped) return fail(409, 'CONFLICT', ['NOT_SHIPPED']);
      throw e;
    }
    if (!payload) return fail(404, 'NOT_FOUND', ['NO_ERP_CHART']);
    await cat.storeErpChart(c.deps, c.who, payload, set.source);
    return { chart: await cat.erpChartView(c.deps, c.who, id) };
  });
}
