// PR 656 (CN-025, CN-044 ERP lane, follow-up 381) — what the Orders designs B and C share: their props and the
// flow strip's view ids. Every figure a design draws comes from the SAME loader design A uses (`loadOrderList`,
// `@/lib/admin-orders/list`) and the same words (`orders.*` in the admin dictionary); a design only arranges them
// differently (HOW-TO-ADD-A-DESIGN.md: "a design is one render module", nothing here invents a count or a label).
import type { ListAccess } from '@/components/admin/orders/OrderListPage';
import type { ListQuery } from '@/lib/admin-orders/model';
import type { AdminView } from '@/lib/admin-page';
import type { Csv, LookMenuProps } from '../LookMenu';

/** The props every Orders design B/C render function takes; each loads its own `OrderListData` (same call design A's
 *  `OrderListPage` makes), so every design always reads the one order service, never a cached or duplicated figure. */
export interface OrdersDesignProps {
  view: AdminView;
  a: ListAccess;
  query: ListQuery;
  now: Date;
  menu: LookMenuProps;
  csv: Csv | null;
}

/** Design C's flow strip: the order service's own view ids and counts (`LIST_PAGES.all.views`, `orders.view.*` in the
 *  dictionary) — never an invented pipeline stage; every number is one `data.counts[id]` the view chips already show. */
export const FLOW_VIEWS = ['toConfirm', 'awaitingAdvance', 'cancelPending', 'open', 'finished'] as const;
