// PR 175 — the practice courier as an adapter of its own (provider `mockCourier`): a courier account the team can book
// with before any real courier is connected, speaking the shop's own status words. It has no key and no live mode, so
// it is not a row in Keys & connections (like the SMS mock); every real courier adapter (Steadfast PR 176, Pathao
// PR 177) has its own practice world in MOCK mode, in its own words.
import { z } from 'zod';
import { AdapterError, defineAdapter } from '../define';
import { COURIER_STATES, EXCEPTION_REASONS, type CourierApi, type CourierCapabilities, type StatusTable } from './contract';
import { createMockCourier, type MockVocabulary } from './mock';

export const MOCK_COURIER_PROVIDER = 'mockCourier';

/** The shop's own words: `in_transit`, and an exception with its reason, `attempt_failed:receiverUnreachable`. */
const table: StatusTable = Object.fromEntries([
  ...COURIER_STATES.map((s) => [s.toLowerCase(), { status: s }] as const),
  ...Object.entries(EXCEPTION_REASONS).flatMap(([s, reasons]) => reasons.map((r) => [`${s.toLowerCase()}:${r.toLowerCase()}`, { status: s as keyof typeof EXCEPTION_REASONS, reasonKey: r }] as const)),
]);

export const practiceVocabulary: MockVocabulary = {
  prefix: 'P',
  say: (step) => (step.reasonKey ? `${step.status.toLowerCase()}:${step.reasonKey.toLowerCase()}` : step.status.toLowerCase()),
  table,
};

export const practiceCapabilities: CourierCapabilities = {
  booking: true,
  tracking: 'poll',
  partialDelivery: true,
  // PR 554: the practice courier has a practice place list and takes its ids when the area is mapped (never needs them)
  zoneIds: true,
  zoneList: true,
  zoneNeeds: null,
  weight: true,
  declaredValue: true,
  cancel: false,
};

export const mockCourierAdapter = defineAdapter<CourierApi, Record<string, never>>({
  kind: 'COURIER',
  provider: MOCK_COURIER_PROVIDER,
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('the practice courier has no live mode');
  },
  async mock() {
    return createMockCourier(MOCK_COURIER_PROVIDER, practiceVocabulary, practiceCapabilities);
  },
  async test(api) {
    return api.health();
  },
});
