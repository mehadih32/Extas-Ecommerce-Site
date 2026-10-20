// @extas/catalogue — the catalogue domain of S01: products, variants keyed by the ERP SKU, colours and sizes (PR 19),
// the category tree with garment types (PR 20), the colour library (PR 30), structured fabric and care (PR 31) and
// naming and links (PR 590); the publish checklist and health score (PR 26, 29: health.ts), publishing, bulk actions and
// the publish queue (PR 21, 35: publish.ts), and what the product admin screens read and save (PR 21: admin-views.ts,
// product-form.ts). Every service takes the database and a settings reader, checks the permission in the
// acting store, scopes every query by store and writes the audit log in the same transaction. The admin screens are
// PR 21; they call these through the admin API (apps/web/src/app/api/admin/catalogue).
export * from './errors';
export * from './context';
export * from './text';
export * from './colour-math';
export * from './dictionaries';
export * from './messages';
export * from './redirects';
export * from './summary';
export * from './colours';
export * from './sizes';
export * from './brands';
export * from './garment-types';
export * from './categories';
export * from './fabrics';
export * from './variants';
export * from './naming';
export * from './products';
export * from './facts';
export * from './health';
export * from './publish';
export * from './admin-views';
export * from './product-form';
// PR 27, 28 size charts · PR 32 collections and tags · PR 34 the catalogue CSV · PR 38 the "was" price.
export * from './size-chart-math';
export * from './size-charts';
export * from './collections';
export * from './csv';
export * from './catalogue-csv';
export * from './was-price';
