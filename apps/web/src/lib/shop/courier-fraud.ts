// S06 · PR 559 — the courier fraud checks the phone-entry check asks (@extas/orders `phoneRiskCheck`), as connected.
// None yet: PR 567 puts Steadfast's, Pathao's and any aggregator's own checks behind one adapter, each on its mock until
// its key arrives (A1.3). Until then the check only counts its look-ups, and the owner's pattern signal reads the shop's
// own records, the same device and the same person. Orders › Risk rules says so under the Phone-entry check card.
import type { CourierFraudSource } from '@extas/orders';

export function courierFraudSources(): CourierFraudSource[] {
  return [];
}
