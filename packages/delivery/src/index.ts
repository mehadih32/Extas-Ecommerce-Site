// @extas/delivery — the delivery-zone engine of S06 (Blueprint §60, D3.12 V2 block). Its standard: a customer is never
// shown a delivery charge that is not his.
// - PR 549 the national gazetteer: division → district → upazila / thana → area with Bengali, English and Banglish
//   names, postcodes and the Dhaka City corporations (gazetteer.ts), its file format (csv.ts), the importer
//   (import.ts) and the shared index read from the database (load.ts). The repository holds a SAMPLE list only.
// - PR 550 band mapping: Dhaka City = the DNCC + DSCC map, the owner's sub-area list the only exception, everywhere
//   else one flat band (bands.ts); the owner's side — charges, hours, the sub-area mode and list (bands-admin.ts);
//   prefix place matching shared with the autocomplete (places.ts).
// - PR 551 the ambiguity resolver: reads the whole finished line — the district settles it silently, only a line still
//   ambiguous asks, a saved address outranks a guess, a confirmed choice never changes silently (resolver.ts); when the
//   line is finished — blur or a pause that always resumes (settle.ts); the service the APIs call (resolve-service.ts).
// - PR 552 address autocomplete: prefix type-ahead, each row with its district and its band's charge (suggest.ts).
// - PR 553 the charge accuracy guard: a charge only from a ResolvedArea the resolver minted, never from text (quote.ts).
// - PR 555 phone-first recognition: the one BD phone normaliser (phone.ts); a bare number prefills the area only, the
//   full address only with a login or a confirmed code (phone-area.ts).
// - PR 563 (S04) the address-detail check: does the line say where the house is (detail.ts)? Only a flag and a call.
// - PR 565 (S04) free delivery is exempt from the band machinery: no band shown, corrected or messaged (exempt.ts).
export * from './text';
export * from './detail';
export * from './exempt';
export * from './gazetteer';
export * from './csv';
export * from './import';
export * from './load';
export * from './errors';
export * from './context';
export * from './bands';
export * from './places';
export * from './bands-admin';
export * from './resolver';
export * from './settle';
export * from './resolve-service';
export * from './suggest';
export * from './quote';
export * from './phone';
export * from './phone-area';
