// @extas/catalogue — the catalogue domain of S01: products, variants keyed by the ERP SKU, colours and sizes (PR 19),
// the category tree with garment types (PR 20), the colour library (PR 30), structured fabric and care (PR 31) and
// naming and links (PR 590). Every service takes the database and a settings reader, checks the permission in the
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
