// PR 1010 — auto-booking: planned only for a store with it on and a person named, once per slot; a run without that person or with the
// default courier off books nothing.
import { describe, expect, it } from 'vitest';
import { jobDefinition } from './catalogue';
import { courierAutoBookPlanner, runCourierAutoBook } from './courier-autobook';
import { slotOf } from './keys';

const STAFF = '3f0c2a52-6a5b-4a5f-9a53-2f4d8f0a1b11';
const at = new Date(Date.UTC(2026, 10, 16, 6, 0, 30));

describe('PR 1010 · courier auto-booking job', () => {
  it('needs a store and has its own run per store', () => {
    const job = jobDefinition('courier.autobook')!;
    expect(job.queue).toBe('courier');
    expect(() => job.parse({})).toThrow(/positive integer/);
    expect(job.storeOf(job.parse({ storeId: 3 }))).toBe(3);
  });

  it('plans one run per slot for a store that has it on with a person named; off or nobody named plans nothing', async () => {
    const value = async (_k: string, o?: { storeId?: number }) => ({ enabled: o?.storeId !== 2, byStaffId: o?.storeId === 3 ? '' : STAFF, everyMinutes: 5 });
    const deps = { couriers: { connections: {} }, settings: { value }, db: { store: { findMany: async () => [{ id: 1 }, { id: 2 }, { id: 3 }] } } } as never;
    const planned = await courierAutoBookPlanner(deps, at);
    expect(planned.map((p) => p.key)).toEqual([`courier.autobook/1/${slotOf(at.getTime(), 5 * 60_000)}`]);
    expect(planned[0]!.queue).toBe('courier');
    // later in the same slot: the same run
    expect((await courierAutoBookPlanner(deps, new Date(at.getTime() + 60_000))).map((p) => p.key)).toEqual(planned.map((p) => p.key));
    // without the couriers' connections nothing is planned
    expect(await courierAutoBookPlanner({} as never, at)).toEqual([]);
  });

  it('a run books nothing while it is off, while the default courier is switched off, or without the couriers', async () => {
    expect(await runCourierAutoBook({} as never, 1)).toEqual({ ok: true, stats: { skipped: 'no couriers' } });
    const mk = (cfg: object, courierOn: boolean) =>
      ({
        couriers: { connections: {} },
        now: () => at,
        settings: { value: async (k: string) => (k === 'delivery.courier.autoBook' ? cfg : { defaultCourierId: '' }) },
        db: { courierAccount: { findMany: async () => [{ id: 'c1', providerKey: 'steadfast', name: 'Steadfast', enabled: courierOn, archivedAt: null }] } },
      }) as never;
    expect(await runCourierAutoBook(mk({ enabled: false, byStaffId: '', everyMinutes: 5 }, true), 1)).toEqual({ ok: true, stats: { skipped: 'off' } });
    expect(await runCourierAutoBook(mk({ enabled: true, byStaffId: STAFF, everyMinutes: 5 }, false), 1)).toEqual({ ok: true, stats: { skipped: 'default courier is off' } });
  });
});
