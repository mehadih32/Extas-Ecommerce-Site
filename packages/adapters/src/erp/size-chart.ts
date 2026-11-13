// S28 · PR 683 — the ERP's size chart per style (site side). The ERP decided (2026-10-31) to send a size chart per style
// to the shops, but the ERP contract does not carry it yet (docs/ERP-API-CONTRACT.md has no size-chart call). Until it
// does, the shop runs on a sample source (`mockErpSizeCharts`) that builds a believable chart from the style code, and
// the real source answers "not shipped". When the ERP ships it, only `erpSizeCharts` changes: the payload below is the
// shape the shop stores and checks, in inches (the shop shows cm beside).
export interface ErpSizeChartPayload {
  styleCode: string;
  unit: 'inch';
  /** Measurement keys (chest, length, shoulder, sleeve …), in column order. */
  fields: string[];
  rows: { size: string; values: number[] }[];
}

export type ErpSizeChartSourceName = 'MOCK' | 'ERP';

export interface ErpSizeChartSource {
  readonly name: ErpSizeChartSourceName;
  /** The chart for a style, or null when the ERP has none for it. */
  sizeChart(styleCode: string): Promise<ErpSizeChartPayload | null>;
}

/** Thrown by the real source until the ERP ships the call. */
export class ErpSizeChartNotShipped extends Error {
  readonly code = 'NOT_SHIPPED';
  constructor() {
    super('the ERP does not send size charts yet');
  }
}

const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
// hardcode-ok: the sample chart's starting measurements and steps (a stand-in for the ERP's own numbers)
const BASE = { chest: 38, length: 26, shoulder: 16.5 };
const STEP = { chest: 2, length: 1, shoulder: 0.5 };

/** A sample chart: the same style code always gives the same chart; a code ending in "0" has none (like an ERP without one). */
export function mockErpSizeCharts(): ErpSizeChartSource {
  return {
    name: 'MOCK',
    async sizeChart(styleCode) {
      const code = styleCode.trim();
      if (!code || code.endsWith('0')) return null;
      const bump = [...code].reduce((a, c) => a + c.charCodeAt(0), 0) % 3;
      const fields = Object.keys(BASE) as (keyof typeof BASE)[];
      return {
        styleCode: code,
        unit: 'inch',
        fields,
        rows: SIZES.map((size, i) => ({ size, values: fields.map((f) => BASE[f] + bump * STEP[f] * 0.5 + i * STEP[f]) })),
      };
    },
  };
}

/** The real source: not shipped yet. */
export function erpSizeCharts(): ErpSizeChartSource {
  return {
    name: 'ERP',
    async sizeChart() {
      throw new ErpSizeChartNotShipped();
    },
  };
}

export function erpSizeChartSource(name: ErpSizeChartSourceName): ErpSizeChartSource {
  return name === 'ERP' ? erpSizeCharts() : mockErpSizeCharts();
}
