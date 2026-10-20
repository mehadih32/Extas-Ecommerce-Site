// S06 · PR 549–553, 555 — the delivery-zone engine (Gyani; @extas/delivery). Every switch, wait and limit of the
// gazetteer, the band map, the resolver, the autocomplete and phone-first recognition lives here, never in code.
// Labels: messages/delivery.<lang>.json. Registry version 15.
//
// The charges themselves are not settings: each band's charge, its delivery hours and whether it is on are the owner's
// figures in the DeliveryBand rows (PR 508 seeds the three bands switched off with no charge), and the sub-area list is
// the owner's AreaBand rows (PR 509 register: owner data). Both ship empty and are typed in by the owner in the admin.
import { z } from 'zod';
import { setting } from './define';

const V = 15;

export const deliverySettings = {
  // ---- PR 549 · the national gazetteer ----
  'delivery.gazetteer.cacheSeconds': setting({
    schema: z.int().min(10).max(86_400),
    default: 300,
    scope: 'installation',
    valueType: 'DURATION_SECONDS',
    group: 'delivery',
    labelKey: 'delivery.gazetteer.cacheSeconds.label',
    helpKey: 'delivery.gazetteer.cacheSeconds.help',
    isOwnerData: false,
    sortOrder: 500,
    version: V,
  }),
};
