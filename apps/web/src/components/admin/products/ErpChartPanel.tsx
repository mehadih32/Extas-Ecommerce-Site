'use client';
// S28 · PR 683 — Products › a product › Size chart from the ERP: where the ERP's chart for this style stands and two
// buttons: get it ("Get the ERP chart") and use it as the product's own size chart ("Use ERP chart"). Until the ERP ships
// size charts a sample stands in (More options). The shop's own chart is never overwritten by a later ERP change.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { call } from '../api';
import { t, type Dict } from '@/lib/i18n';
import { refusalText } from './model';
import { say, sayBad } from './useToast';

export interface ErpChartPanelProps {
  dict: Dict;
  productId: string;
  canWrite: boolean;
  settingsHref: string;
  chart: { state: 'off' | 'no-style' | 'none' | 'available' | 'applied' | 'newer'; styleCode: string | null; source: 'MOCK' | 'ERP' | null; sizes: string[] };
}

export function ErpChartPanel(p: ErpChartPanelProps) {
  const d = p.dict;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const api = `/api/admin/products/${p.productId}/erp-size-chart`;
  const c = p.chart;

  const post = async (action: 'fetch' | 'use') => {
    setBusy(true);
    try {
      const a = await call('POST', api, { action });
      if (a.status !== 200) {
        const det = a.data.details ?? [];
        const key = det.includes('NOT_SHIPPED') ? 'notShipped' : det.includes('NO_ERP_CHART') ? 'noErpChart' : det.includes('NO_GARMENT_TYPE') ? 'noGarment' : null;
        return sayBad(key ? t(d, `products.erpc.${key}`) : refusalText(d, a.data.error, det));
      }
      const made = a.data.made as { already: boolean; skippedFields: string[]; skippedSizes: string[] } | undefined;
      if (action === 'use' && made) {
        const left = [...made.skippedFields, ...made.skippedSizes].join(', ');
        say(made.already ? t(d, 'products.erpc.already') : `${t(d, 'products.erpc.used')}${left ? ` ${t(d, 'products.erpc.skipped', { what: left })}` : ''}`);
      } else say(t(d, 'products.erpc.fetched'));
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const vars = { style: c.styleCode ?? '', sizes: c.sizes.join(', '), source: c.source ? t(d, `products.erpc.source_${c.source}`) : '' };
  return (
    <div className="pm-video" data-testid="erp-chart-panel" data-state={c.state}>
      <div className="ad-label">{t(d, 'products.erpc.title')}</div>
      <p className="ad-mini">{t(d, 'products.erpc.help')}</p>
      {c.state === 'off' ? (
        <p className="ad-mini" data-testid="erp-chart-off">
          {t(d, 'products.erpc.off')} <a href={p.settingsHref}>{t(d, 'products.erpc.turnOn')}</a>
        </p>
      ) : (
        <>
          <p className="ad-mini" data-testid="erp-chart-note">
            {c.state === 'no-style' ? t(d, 'products.erpc.noStyle') : t(d, `products.erpc.${c.state}`, vars)}
          </p>
          {p.canWrite && c.state !== 'no-style' ? (
            <div className="fq-acts">
              <button type="button" className="ad-btn-sm" disabled={busy} onClick={() => post('fetch')} data-action="erp-chart-fetch">
                {t(d, 'products.erpc.fetch')}
              </button>
              {c.state === 'available' || c.state === 'newer' ? (
                <button type="button" className="ad-btn-sm" disabled={busy} onClick={() => post('use')} data-action="erp-chart-use">
                  {t(d, c.state === 'newer' ? 'products.erpc.useNew' : 'products.erpc.use')}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
