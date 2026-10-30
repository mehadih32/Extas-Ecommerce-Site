// CN-028 · CN-029 Phase 1, Bhandari's lane (PR 609, 620). Registry version 65. Labels: messages/bhandari-p1.<lang>.json.
// The §11 keys these PRs read (`catalogue.bGrade.listing`, `catalogue.floor.minMarginPercent`) are in registry-erp-v6.ts
// (Phase 0); this file holds only what the lane adds.
//
// PR 609 (Products group): the words added to a B-grade listing's name when a style is imported from the ERP, and how
// many changed buying prices the import page lists (qa-gate 30 Oct: was a number in the code).
import { z } from 'zod';
import { setting } from './define';

const V = 65;

const catalogue = { scope: 'store', isOwnerData: false, isPublic: false, group: 'catalogue', version: V } as const;

export const bhandariP1Settings = {
  // ---- PR 609 · import by style code ----
  'catalogue.bGrade.nameSuffix': setting({
    ...catalogue,
    // Added to the end of a B-grade listing's name at import (the admin can rename the product afterwards).
    schema: z.string().max(60),
    default: ' (B grade)',
    valueType: 'STRING',
    labelKey: 'catalogue.bGrade.nameSuffix.label',
    helpKey: 'catalogue.bGrade.nameSuffix.help',
    sortOrder: 62,
  }),
  'catalogue.shopPrice.changesShown': setting({
    ...catalogue,
    scope: 'installation',
    schema: z.int().min(1).max(1000),
    default: 100,
    valueType: 'INT',
    labelKey: 'catalogue.shopPrice.changesShown.label',
    helpKey: 'catalogue.shopPrice.changesShown.help',
    sortOrder: 63,
  }),
};
