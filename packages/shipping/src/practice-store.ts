// S08 · PR 176 — follow-up 375: the practice courier's parcels kept in the shop's database (PracticeParcel), so the web
// app that books a practice parcel and the worker whose `courier.track` reads it play the same scripted life on staging.
// Only practice (MOCK) parcels are kept here; a real courier is never touched. `courierApi` (accounts.ts) sets this
// store whenever a courier answers on its practice world. A row that no longer reads as a practice parcel is ignored.
import { MOCK_SCENARIOS, type CourierParcel, type MockParcel, type MockScenario, type PracticeParcelStore } from '@extas/adapters';
import type { Db } from './context';

const isScenario = (s: string): s is MockScenario => (MOCK_SCENARIOS as readonly string[]).includes(s);

/** The practice parcels in `db`. */
export function practiceParcelStore(db: Db): PracticeParcelStore {
  return {
    async load(provider, consignmentId) {
      const r = await db.practiceParcel.findUnique({ where: { provider_consignmentId: { provider, consignmentId } } });
      if (!r || !isScenario(r.scenario)) return null;
      return { consignmentId: r.consignmentId, trackingCode: r.trackingCode, parcel: r.parcel as unknown as CourierParcel, scenario: r.scenario, reached: r.reached, bookedAt: r.bookedAt.getTime() };
    },
    async save(provider, p: MockParcel) {
      const data = { trackingCode: p.trackingCode, merchantRef: p.parcel.merchantRef, parcel: p.parcel as unknown as object, scenario: p.scenario, reached: p.reached, bookedAt: new Date(p.bookedAt) };
      await db.practiceParcel.upsert({ where: { provider_consignmentId: { provider, consignmentId: p.consignmentId } }, create: { provider, consignmentId: p.consignmentId, ...data }, update: data });
    },
  };
}
