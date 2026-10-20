// @extas/delivery — the delivery-zone engine of S06 (Blueprint §60, D3.12 V2 block). Its standard: a customer is never
// shown a delivery charge that is not his.
// - PR 549 the national gazetteer: division → district → upazila / thana → area with Bengali, English and Banglish
//   names, postcodes and the Dhaka City corporations (gazetteer.ts), its file format (csv.ts), the importer
//   (import.ts) and the shared index read from the database (load.ts). The repository holds a SAMPLE list only.
// - PR 550 band mapping: Dhaka City = the DNCC + DSCC map, the owner's sub-area list the only exception, everywhere
//   else one flat band (bands.ts); the owner's side — charges, hours, the sub-area mode and list (bands-admin.ts);
//   prefix place matching shared with the autocomplete (places.ts).
export * from './text';
export * from './gazetteer';
export * from './csv';
export * from './import';
export * from './load';
export * from './errors';
export * from './context';
export * from './bands';
export * from './places';
export * from './bands-admin';
