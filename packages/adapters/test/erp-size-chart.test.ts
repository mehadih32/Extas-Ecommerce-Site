// S28 · PR 683 — the sample ERP size-chart source and the real one that says "not shipped" until the ERP sends charts.
import { describe, expect, it } from 'vitest';
import { erpSizeChartSource, ErpSizeChartNotShipped, mockErpSizeCharts } from '../src/erp/size-chart';

describe('ERP size chart sources', () => {
  it('builds the same sample chart for the same style code, growing with the size', async () => {
    const a = await mockErpSizeCharts().sizeChart('ST-101');
    expect(a).toEqual(await mockErpSizeCharts().sizeChart('ST-101'));
    expect(a!.unit).toBe('inch');
    expect(a!.rows.map((r) => r.size)).toEqual(['S', 'M', 'L', 'XL', 'XXL']);
    for (const r of a!.rows) expect(r.values).toHaveLength(a!.fields.length);
    expect(a!.rows[4]!.values[0]!).toBeGreaterThan(a!.rows[0]!.values[0]!);
  });
  it('has no chart for a style the sample ERP does not know (code ending in 0)', async () => {
    expect(await mockErpSizeCharts().sizeChart('ST-100')).toBeNull();
    expect(await mockErpSizeCharts().sizeChart('  ')).toBeNull();
  });
  it('says not shipped for the real source', async () => {
    await expect(erpSizeChartSource('ERP').sizeChart('ST-101')).rejects.toBeInstanceOf(ErpSizeChartNotShipped);
    expect(erpSizeChartSource('MOCK').name).toBe('MOCK');
  });
});
