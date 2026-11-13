// S28 · PR 683 — the ERP's chart payload: the shape is checked and the version hash follows the numbers only.
import { describe, expect, it } from 'vitest';
import { erpSizeChartPayloadSchema, hashOfChart } from '../src/erp-size-chart';

const base = {
  styleCode: 'ST-1',
  unit: 'inch' as const,
  fields: ['chest', 'length'],
  rows: [
    { size: 'S', values: [38, 26] },
    { size: 'M', values: [40, 27] },
  ],
};

describe('ERP size chart payload', () => {
  it('takes the contract shape and refuses a stray field, a non-inch unit and zero or negative numbers', () => {
    expect(erpSizeChartPayloadSchema.safeParse(base).success).toBe(true);
    expect(erpSizeChartPayloadSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(erpSizeChartPayloadSchema.safeParse({ ...base, unit: 'cm' }).success).toBe(false);
    expect(erpSizeChartPayloadSchema.safeParse({ ...base, rows: [{ size: 'S', values: [0, 26] }] }).success).toBe(false);
  });
  it('hashes the measurements and sizes, not the style code', () => {
    expect(hashOfChart(base)).toBe(hashOfChart({ ...base, styleCode: 'OTHER' } as typeof base));
    expect(hashOfChart(base)).not.toBe(
      hashOfChart({
        ...base,
        rows: [
          { size: 'S', values: [38, 26] },
          { size: 'M', values: [41, 27] },
        ],
      }),
    );
  });
});
