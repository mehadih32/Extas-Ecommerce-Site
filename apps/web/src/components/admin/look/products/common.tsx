// PR 657 (CN-025, CN-044 ERP lane, follow-up 382) — shared props/constants for the Products B/C designs. Every figure
// comes from the one loader (`loadProductList`, `@/lib/admin-products`); these designs read nothing design A does not
// already read and write nothing (a read-only re-arrangement, CN-044).
import type { CatalogueAccess, ProductQuery } from '@/lib/admin-products';
import type { AdminView } from '@/lib/admin-page';
import type { Csv, LookMenuProps } from '../LookMenu';

export interface ProductsDesignProps {
  view: AdminView;
  c: CatalogueAccess;
  query: ProductQuery;
  menu: LookMenuProps;
  csv: Csv | null;
}
