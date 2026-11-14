// S28 · PR 714-717 — the words of the four v5 report pages (messages/admin-reports-v5.<lang>.json, `reportsV5.*`) and the money
// reports' period words (`moneyCostReport.*`), added to the admin view's dictionary.
import type { AdminView } from '../admin-page';
import type { Dict } from '../i18n';
import costBn from '../../../messages/admin-cost-report.bn.json';
import costEn from '../../../messages/admin-cost-report.en.json';
import bn from '../../../messages/admin-reports-v5.bn.json';
import en from '../../../messages/admin-reports-v5.en.json';

export function withReportsV5<V extends AdminView>(view: V): V {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, reportsV5: (b ? bn : en).reportsV5 as unknown as Dict, moneyCostReport: (b ? costBn : costEn).moneyCostReport as unknown as Dict } };
}
