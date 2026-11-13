// S15 · PR 340 — the "shop funnel" the Reports › Funnels page offers to create with one tap when the store has
// none saved yet (the demo's own `97y-adm2-reports.js` "REP-10 Funnels" fixed 4-step funnel: product_view →
// add_to_bag → checkout_start → purchase). Nothing is created automatically on install or deploy (CLAUDE.md rule 4,
// CN-018 "ship empty/off defaults") — this is only the text/shape a tap posts to the existing PR 339 create API.
import type { AnalyticsEventName } from '@extas/analytics';

export interface DefaultFunnelStep {
  key: string;
  label: string;
  eventName: AnalyticsEventName;
}

const STEPS_EN: DefaultFunnelStep[] = [
  { key: 'view', label: 'Viewed the product', eventName: 'product_view' },
  { key: 'bag', label: 'Added to bag', eventName: 'add_to_bag' },
  { key: 'checkout', label: 'Started checkout', eventName: 'checkout_start' },
  { key: 'order', label: 'Ordered', eventName: 'purchase' },
];
const STEPS_BN: DefaultFunnelStep[] = [
  { key: 'view', label: 'প্রোডাক্ট দেখেছে', eventName: 'product_view' },
  { key: 'bag', label: 'ব্যাগে নিয়েছে', eventName: 'add_to_bag' },
  { key: 'checkout', label: 'চেকআউট শুরু করেছে', eventName: 'checkout_start' },
  { key: 'order', label: 'অর্ডার করেছে', eventName: 'purchase' },
];

export function defaultFunnelInput(lang: 'en' | 'bn'): { name: string; steps: DefaultFunnelStep[] } {
  return { name: lang === 'bn' ? 'দোকানের ফানেল' : 'Shop funnel', steps: lang === 'bn' ? STEPS_BN : STEPS_EN };
}
