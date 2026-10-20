// S01 · PR 33, 36, 39 — the catalogue's tools (Bhandari): import a product from a link, the ghost archive with its
// back-in-stock interest list, and the product audit report. Every switch, limit and channel of these lives here,
// never in code. Labels: messages/catalogue-tools.<lang>.json. Registry version 9.
//
// - Link import (PR 33) reads an outside page through the page reader connection (Keys & connections; a mock until it
//   is switched on, A1.3) within the limits below, and only ever makes a draft: prices are never taken from a page.
// - Ghost archive (PR 36): an out-of-stock or unpublished product keeps its page; the interest form takes a phone
//   number or an e-mail on the channels switched on here. What is collected is the owner's (register: BackInStockRequest).
// - Audit (PR 39): how old a stored checklist result may be before the report checks the product again.
import { z } from 'zod';
import { setting } from './define';

const V = 9;

/** A host name as typed by the owner (`shop.example.com`), lower case, no scheme, no path. */
export const hostNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, { message: 'a host name such as shop.example.com' });

/** How a customer can ask to be told when a product is back. */
export const INTEREST_CHANNELS = ['phone', 'email'] as const;
export type InterestChannel = (typeof INTEREST_CHANNELS)[number];

export const catalogueToolsSettings = {
  // ---- PR 33 · import from a link ----
  'catalogue.linkImport.enabled': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'catalogue',
    labelKey: 'catalogue.linkImport.enabled.label',
    helpKey: 'catalogue.linkImport.enabled.help',
    isOwnerData: false,
    sortOrder: 400,
    version: V,
  }),
  'catalogue.linkImport.allowedHosts': setting({
    schema: z.array(hostNameSchema).max(200).refine((l) => new Set(l).size === l.length, { message: 'each host once' }),
    default: [],
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.linkImport.allowedHosts.label',
    helpKey: 'catalogue.linkImport.allowedHosts.help',
    isOwnerData: false,
    sortOrder: 410,
    version: V,
  }),
  'catalogue.linkImport.maxPageKb': setting({
    schema: z.int().min(50).max(10_000),
    default: 2000,
    scope: 'installation',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.linkImport.maxPageKb.label',
    helpKey: 'catalogue.linkImport.maxPageKb.help',
    isOwnerData: false,
    sortOrder: 420,
    version: V,
  }),
  'catalogue.linkImport.timeoutSeconds': setting({
    schema: z.int().min(2).max(60),
    default: 15,
    scope: 'installation',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.linkImport.timeoutSeconds.label',
    helpKey: 'catalogue.linkImport.timeoutSeconds.help',
    isOwnerData: false,
    sortOrder: 430,
    version: V,
  }),
  'catalogue.linkImport.maxRedirects': setting({
    schema: z.int().min(0).max(10),
    default: 3,
    scope: 'installation',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.linkImport.maxRedirects.label',
    helpKey: 'catalogue.linkImport.maxRedirects.help',
    isOwnerData: false,
    sortOrder: 440,
    version: V,
  }),
  'catalogue.linkImport.maxImages': setting({
    schema: z.int().min(0).max(40),
    default: 12,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.linkImport.maxImages.label',
    helpKey: 'catalogue.linkImport.maxImages.help',
    isOwnerData: false,
    sortOrder: 450,
    version: V,
  }),
  'catalogue.linkImport.useAi': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'catalogue',
    labelKey: 'catalogue.linkImport.useAi.label',
    helpKey: 'catalogue.linkImport.useAi.help',
    isOwnerData: false,
    sortOrder: 460,
    version: V,
  }),

  // ---- PR 36 · ghost archive and back-in-stock interest ----
  'catalogue.ghost.interest.enabled': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'catalogue',
    labelKey: 'catalogue.ghost.interest.enabled.label',
    helpKey: 'catalogue.ghost.interest.enabled.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 500,
    version: V,
  }),
  'catalogue.ghost.interest.channels': setting({
    schema: z.array(z.enum(INTEREST_CHANNELS)).min(1).max(INTEREST_CHANNELS.length).refine((l) => new Set(l).size === l.length, { message: 'each channel once' }),
    default: ['phone', 'email'],
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.ghost.interest.channels.label',
    helpKey: 'catalogue.ghost.interest.channels.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 510,
    version: V,
  }),
  'catalogue.ghost.interest.callingCode': setting({
    schema: z.string().regex(/^[1-9]\d{0,3}$/, { message: 'a country calling code without +, such as 880' }),
    default: '880',
    scope: 'store',
    valueType: 'STRING',
    group: 'catalogue',
    labelKey: 'catalogue.ghost.interest.callingCode.label',
    helpKey: 'catalogue.ghost.interest.callingCode.help',
    isOwnerData: false,
    sortOrder: 520,
    version: V,
  }),
  'catalogue.ghost.interest.maxPerContactPerDay': setting({
    schema: z.int().min(1).max(100),
    default: 5,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.ghost.interest.maxPerContactPerDay.label',
    helpKey: 'catalogue.ghost.interest.maxPerContactPerDay.help',
    isOwnerData: false,
    sortOrder: 530,
    version: V,
  }),
  'catalogue.ghost.alternatives': setting({
    schema: z.int().min(0).max(12),
    default: 4,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.ghost.alternatives.label',
    helpKey: 'catalogue.ghost.alternatives.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 540,
    version: V,
  }),

  // ---- PR 39 · the product audit report ----
  'catalogue.audit.staleDays': setting({
    schema: z.int().min(1).max(365),
    default: 7,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.audit.staleDays.label',
    helpKey: 'catalogue.audit.staleDays.help',
    isOwnerData: false,
    sortOrder: 600,
    version: V,
  }),
  'catalogue.audit.recheckMax': setting({
    schema: z.int().min(0).max(500),
    default: 50,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.audit.recheckMax.label',
    helpKey: 'catalogue.audit.recheckMax.help',
    isOwnerData: false,
    sortOrder: 610,
    version: V,
  }),
};
