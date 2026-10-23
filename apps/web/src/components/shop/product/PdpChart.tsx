'use client';
// PR 57 — "Size chart" and its popup (Blueprint D3.8, demo 30-product.js pdp_chartBtn / pdp_chartHTML): the chart's
// name, inches / cm, one row per size of this product with the stock of the chosen colour (a row out of stock says
// so), only the measurements the chart has, and a tap on a row chooses that size and closes the popup. Under it: "Ask
// on WhatsApp" (the owner's number) and "How to measure" (the owner's texts, `catalogue.sizeCharts.howToMeasure`).
// PR 58: "Not sure? Find my size" comes first in that row where the finder is offered (demo pdp_chartHTML).
// PR 88: the window itself (PdpChartSheet) is its own chunk, fetched once the page is idle (so a tap opens it at once)
// or on the first open; this part is only the button.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { whenIdle } from '@/lib/shop/later';
import { usePdp } from './PdpRoot';

const loadSheet = () => import('./PdpChartSheet');
const ChartSheet = lazy(() => loadSheet().then((x) => ({ default: x.ChartSheet })));

export function PdpChart() {
  const { m, w } = usePdp();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const has = Boolean(m.chart);
  useEffect(() => (has ? whenIdle(() => void loadSheet().catch(() => undefined)) : undefined), [has]);
  if (!m.chart) return null;

  return (
    <>
      <button ref={btn} type="button" className="pdp-chartbtn pdp-fx v2" data-testid="open-chart" data-fx-max="2" data-l="0" aria-label={w('sizeChart')} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="ruler" size={16} />
        <span className="pdp-cbt">{w('sizeChart')}</span>
        <span className="pdp-cbc">
          <Icon name="right" size={14} />
        </span>
      </button>
      {open ? (
        <Suspense fallback={null}>
          <ChartSheet onClose={close} opener={btn} />
        </Suspense>
      ) : null}
    </>
  );
}
