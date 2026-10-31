// S18 · PR 382 (BACKEND-ARCHITECTURE §5.5 CUS-07, §5.13 SET-08d; decision D9) — customers' erasure requests (registry
// version 79; lane B's reserved run, CN-031). Labels: messages/privacy.<lang>.json.
//
// - `privacy.erasureRequests`: off by default. When on, a person holding `customers.privacy` can file a customer's
//   request to erase his personal details, and the owner alone carries it out with a typed confirmation: the details
//   are anonymised, money and stock records stay (D9; @extas/customers erasure.ts). Nothing happens on its own.
// - `privacy.requestsListSize`: how many requests the Privacy & data page lists.
// The IP/GPS keeping period is `risk.capture` (PR 159), shown and saved on the same page.
import { z } from 'zod';
import { setting } from './define';

const V = 79;

const base = { isOwnerData: false, isPublic: false, group: 'privacy', version: V } as const;

export const privacySettings = {
  'privacy.erasureRequests': setting({
    ...base,
    scope: 'store',
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'privacy.erasureRequests.label',
    helpKey: 'privacy.erasureRequests.help',
    sortOrder: 10,
  }),
  'privacy.requestsListSize': setting({
    ...base,
    scope: 'installation',
    schema: z.int().min(10).max(200),
    default: 50,
    valueType: 'INT',
    labelKey: 'privacy.requestsListSize.label',
    helpKey: 'privacy.requestsListSize.help',
    sortOrder: 20,
  }),
};
