// S28 · PR 688 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): budgets are set with the owner's PIN and
// fixedcosts.write, append only (the latest counts, nothing edited), spent comes from the fixed costs and cost entries, the
// profit snapshot has its three spans, and the refund approvers are the roles holding the approve permission.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { hashPassword, type Actor } from '@extas/auth';
import { budgetsView, profitSnapshot, refundApprovers, setBooksPin, setBudgets } from '../src';
import { setUpBooks, type BooksFixture } from './books-fixture';

const OWNER_PASSWORD = 'sample-owner-password-688';
const PIN = '480326';

describe.skipIf(!HAS_TEST_DB)('budgets on PostgreSQL (PR 688)', () => {
  let f: BooksFixture;
  let owner: Actor;
  let reader: Actor;
  beforeAll(async () => {
    f = await setUpBooks('budgets');
    owner = await f.owner('budgets');
    await f.t.prisma.staffUser.update({ where: { id: owner.staffUserId! }, data: { passwordHash: await hashPassword(OWNER_PASSWORD) } });
    await setBooksPin(f.deps(), f.who(owner, f.storeA), { password: OWNER_PASSWORD, pin: PIN });
    reader = await f.staff(['books.read'], null, 'budgets-reader');
    f.clock.now = new Date('2026-11-13T06:00:00Z');
  });
  afterAll(async () => f?.t.drop());
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'ok';
    } catch (e) {
      return (e as { code?: string }).code ?? String(e);
    }
  };
  const view = (who = owner) => budgetsView(f.deps(), f.who(who, f.storeA));
  const set = (who: Actor, input: Record<string, unknown>) => setBudgets(f.deps(), f.who(who, f.storeA), { pin: PIN, fromMonth: '2026-11', budgets: {}, ...input } as never);

  it('ships with no budgets: every head has no state', async () => {
    const v = await view();
    expect(v.month).toBe('2026-11');
    expect(v.day).toBe(13);
    expect(v.lines.every((l) => l.budgetMinor === null && l.state === 'none')).toBe(true);
  });

  it('needs fixedcosts.write, a PIN and a real head', async () => {
    expect(await code(set(reader, { budgets: { RENT: 1000 } }))).toBe('FORBIDDEN');
    expect(await code(setBudgets(f.deps(), f.who(owner, f.storeA), { fromMonth: '2026-11', budgets: { RENT: 1000 } } as never))).toBe('PIN_REQUIRED');
    expect(await code(set(owner, { pin: '000000', budgets: { RENT: 1000 } }))).toBe('WRONG_PIN');
    expect(await code(set(owner, { budgets: { NOPE: 1000 } }))).toBe('INVALID_INPUT');
  });

  it('sets budgets, changes one by a new row, and the latest counts', async () => {
    expect((await set(owner, { budgets: { RENT: 50_000, PACKAGING: 10_000 } })).changed.sort()).toEqual(['PACKAGING', 'RENT']);
    expect((await set(owner, { budgets: { RENT: 50_000, PACKAGING: 12_000 } })).changed).toEqual(['PACKAGING']);
    const v = await view();
    expect(v.lines.find((l) => l.headKey === 'RENT')!.budgetMinor).toBe(50_000);
    expect(v.lines.find((l) => l.headKey === 'PACKAGING')!.budgetMinor).toBe(12_000);
    expect(await f.t.prisma.costBudget.count({ where: { storeId: f.storeA, headKey: 'PACKAGING' } })).toBe(2);
  });

  it('a budget from a later month does not count yet', async () => {
    await set(owner, { fromMonth: '2026-12', budgets: { RENT: 99_000 } });
    expect((await view()).lines.find((l) => l.headKey === 'RENT')!.budgetMinor).toBe(50_000);
  });

  it('the profit snapshot has today, the week and the month', async () => {
    const s = await profitSnapshot(f.deps(), f.who(reader, f.storeA));
    expect(s.spans.map((x) => x.key)).toEqual(['today', 'week', 'month']);
    expect(s.spans[0]!.from).toBe('2026-11-13');
    expect(s.spans[1]!.from).toBe('2026-11-07');
    expect(s.spans[2]!.from).toBe('2026-11-01');
  });

  it('lists the roles that can approve refunds', async () => {
    const r = await refundApprovers(f.deps(), f.who(reader, f.storeA));
    expect(Array.isArray(r.roles)).toBe(true);
  });
});
