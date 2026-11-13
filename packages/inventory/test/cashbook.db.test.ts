// S28 · PR 687 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the cashbook records money in and out and moves
// between accounts with the owner's PIN, appends only (a wrong entry is reversed once, a move on both accounts), a double tap
// records once, the books.cash switch stops recording, balances and the month's figures are right, nothing crosses stores.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { hashPassword, type Actor } from '@extas/auth';
import { addCashAccount, cashbookForecast, cashbookView, recordCash, reverseCash, setBooksPin } from '../src';
import { setUpBooks, type BooksFixture } from './books-fixture';

const OWNER_PASSWORD = 'sample-owner-password-687';
const PIN = '480326';

describe.skipIf(!HAS_TEST_DB)('cashbook on PostgreSQL (PR 687)', () => {
  let f: BooksFixture;
  let owner: Actor;
  let reader: Actor;
  let accounts: Actor;
  let n = 0;
  const key = () => `cash-test-key-${(n += 1)}`;

  beforeAll(async () => {
    f = await setUpBooks('cashbook');
    owner = await f.owner('cashbook');
    await f.t.prisma.staffUser.update({
      where: { id: owner.staffUserId! },
      data: { passwordHash: await hashPassword(OWNER_PASSWORD) },
    });
    await setBooksPin(f.deps(), f.who(owner, f.storeA), {
      password: OWNER_PASSWORD,
      pin: PIN,
    });
    reader = await f.staff(['books.read'], null, 'cashbook-reader');
    accounts = await f.staff(['books.read', 'cash.record'], null, 'cashbook-accounts');
    f.clock.now = new Date('2026-11-13T06:00:00Z');
  });
  afterAll(async () => f?.t.drop());

  const put = (who: Actor, input: Record<string, unknown>, store = f.storeA) => recordCash(f.deps(), f.who(who, store), { pin: PIN, ...input } as never);
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'ok';
    } catch (e) {
      return (e as { code?: string }).code ?? String(e);
    }
  };
  const view = (store = f.storeA, who = owner) => cashbookView(f.deps(), f.who(who, store));
  const bal = (v: Awaited<ReturnType<typeof view>>, k: string) => v.accounts.find((a) => a.key === k)!.balanceMinor;

  it('starts with Cash, Bank, bKash and Nagad at nothing', async () => {
    const v = await view();
    expect(v.accounts.map((a) => a.key)).toEqual(['cash', 'bank', 'bkash', 'nagad']);
    expect(v.totalMinor).toBe(0);
    expect(v.entries).toEqual([]);
    expect(v.enabled).toBe(true);
  });

  it('records an opening balance, owner money in and out, with a note, and shows the balance after each', async () => {
    await put(owner, {
      kind: 'OPENING',
      accountKey: 'bank',
      amountMinor: 500_000,
      day: '2026-11-01',
      requestKey: key(),
    });
    const a = await put(owner, {
      kind: 'CAPITAL',
      accountKey: 'bank',
      amountMinor: 1_000_000,
      note: 'Eid stock money',
      requestKey: key(),
    });
    expect(a.entries[0]).toMatchObject({
      kind: 'CAPITAL',
      amountMinor: 1_000_000,
      note: 'Eid stock money',
      balanceAfterMinor: 1_500_000,
      day: '2026-11-13',
    });
    const b = await put(owner, {
      kind: 'OWNER_TAKE',
      accountKey: 'bank',
      amountMinor: 200_000,
      requestKey: key(),
    });
    expect(b.entries[0]).toMatchObject({
      amountMinor: -200_000,
      balanceAfterMinor: 1_300_000,
    });
    const v = await view();
    expect(bal(v, 'bank')).toBe(1_300_000);
    expect(v.entries[0]!.kind).toBe('OWNER_TAKE');
    expect(v.month).toMatchObject({ inMinor: 1_000_000, outMinor: 200_000 });
  });

  it('a move between accounts is two rows with one id, not money in or out, and the balances follow', async () => {
    const r = await put(owner, {
      kind: 'TRANSFER',
      accountKey: 'bank',
      toAccountKey: 'bkash',
      amountMinor: 300_000,
      requestKey: key(),
    });
    expect(r.entries).toHaveLength(2);
    expect(new Set(r.entries.map((e) => e.transferId)).size).toBe(1);
    const v = await view();
    expect(bal(v, 'bank')).toBe(1_000_000);
    expect(bal(v, 'bkash')).toBe(300_000);
    expect(v.month).toMatchObject({ inMinor: 1_000_000, outMinor: 200_000 });
    expect(
      await code(
        put(owner, {
          kind: 'TRANSFER',
          accountKey: 'bank',
          toAccountKey: 'bank',
          amountMinor: 1,
          requestKey: key(),
        }),
      ),
    ).toBe('INVALID_INPUT');
  });

  it('a double tap with the same request key records once', async () => {
    const k = key();
    const first = await put(owner, {
      kind: 'OTHER_IN',
      accountKey: 'cash',
      amountMinor: 40_000,
      requestKey: k,
    });
    const again = await put(owner, {
      kind: 'OTHER_IN',
      accountKey: 'cash',
      amountMinor: 40_000,
      requestKey: k,
    });
    expect(first.repeated).toBe(false);
    expect(again.repeated).toBe(true);
    expect(bal(await view(), 'cash')).toBe(40_000);
  });

  it('needs the permission and the owner PIN; a reader and a wrong PIN are refused, nothing is written', async () => {
    expect(
      await code(
        put(reader, {
          kind: 'OTHER_IN',
          accountKey: 'cash',
          amountMinor: 1_000,
          requestKey: key(),
        }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await code(
        put(accounts, {
          kind: 'OTHER_IN',
          accountKey: 'cash',
          amountMinor: 1_000,
          requestKey: key(),
          pin: '',
        }),
      ),
    ).toBe('PIN_REQUIRED');
    expect(
      await code(
        put(accounts, {
          kind: 'OTHER_IN',
          accountKey: 'cash',
          amountMinor: 1_000,
          requestKey: key(),
          pin: '111111',
        }),
      ),
    ).not.toBe('ok');
    expect(bal(await view(), 'cash')).toBe(40_000);
    // a person with the permission records after the owner's PIN
    expect(
      await code(
        put(accounts, {
          kind: 'OTHER_OUT',
          accountKey: 'cash',
          amountMinor: 5_000,
          requestKey: key(),
        }),
      ),
    ).toBe('ok');
    expect(await code(cashbookView(f.deps(), f.who(reader, f.storeA)))).toBe('ok');
  });

  it('refuses a bad amount, a day in the future, an unknown account and an unknown kind', async () => {
    expect(await code(put(owner, { kind: 'OTHER_IN', accountKey: 'cash', amountMinor: 0 }))).toBe('INVALID_INPUT');
    expect(await code(put(owner, { kind: 'OTHER_IN', accountKey: 'cash', amountMinor: 1.5 }))).toBe('INVALID_INPUT');
    expect(
      await code(
        put(owner, {
          kind: 'OTHER_IN',
          accountKey: 'cash',
          amountMinor: 10,
          day: '2026-11-20',
        }),
      ),
    ).toBe('INVALID_INPUT');
    expect(await code(put(owner, { kind: 'OTHER_IN', accountKey: 'rocket', amountMinor: 10 }))).toBe('NOT_FOUND');
    expect(await code(put(owner, { kind: 'REVERSAL', accountKey: 'cash', amountMinor: 10 }))).toBe('INVALID_INPUT');
  });

  it('reverses a wrong entry once with a new row (never edited), a move on both accounts, and the month is put right', async () => {
    const r = await put(owner, {
      kind: 'EXPENSE',
      accountKey: 'cash',
      amountMinor: 9_000,
      requestKey: key(),
    });
    const id = r.entries[0]!.id;
    const before = bal(await view(), 'cash');
    const rev = await reverseCash(f.deps(), f.who(owner, f.storeA), id, {
      reason: 'typed twice',
      pin: PIN,
    });
    expect(rev.entries[0]).toMatchObject({
      kind: 'REVERSAL',
      amountMinor: 9_000,
      reversesId: id,
      reason: 'typed twice',
    });
    expect(bal(await view(), 'cash')).toBe(before + 9_000);
    const original = await f.t.prisma.cashEntry.findUniqueOrThrow({
      where: { id },
    });
    expect(original.amountMinor).toBe(-9_000);
    expect(
      await code(
        reverseCash(f.deps(), f.who(owner, f.storeA), id, {
          reason: 'again',
          pin: PIN,
        }),
      ),
    ).toBe('ALREADY');
    expect(
      await code(
        reverseCash(f.deps(), f.who(owner, f.storeA), rev.entries[0]!.id, {
          reason: 'undo the undo',
          pin: PIN,
        }),
      ),
    ).toBe('NOT_ADJUSTABLE');
    expect(
      await code(
        reverseCash(f.deps(), f.who(owner, f.storeA), id, {
          reason: 'x',
          pin: PIN,
        }),
      ),
    ).toBe('INVALID_INPUT');
    const view1 = await view();
    expect(view1.entries.find((e) => e.id === id)!.reversed).toBe(true);
    expect(view1.month.outMinor).toBe(200_000 + 5_000); // the reversed expense is gone from the month's money out

    const mv = await put(owner, {
      kind: 'TRANSFER',
      accountKey: 'bkash',
      toAccountKey: 'nagad',
      amountMinor: 50_000,
      requestKey: key(),
    });
    const both = await reverseCash(f.deps(), f.who(owner, f.storeA), mv.entries[0]!.id, { reason: 'wrong wallet', pin: PIN });
    expect(both.entries).toHaveLength(2);
    const v = await view();
    expect(bal(v, 'nagad')).toBe(0);
    expect(bal(v, 'bkash')).toBe(300_000);
  });

  it('a wrong PIN or no PIN does not reverse anything', async () => {
    const r = await put(owner, {
      kind: 'OTHER_IN',
      accountKey: 'cash',
      amountMinor: 7_000,
      requestKey: key(),
    });
    expect(
      await code(
        reverseCash(f.deps(), f.who(owner, f.storeA), r.entries[0]!.id, {
          reason: 'because',
          pin: '',
        }),
      ),
    ).toBe('PIN_REQUIRED');
    expect(
      await code(
        reverseCash(f.deps(), f.who(owner, f.storeA), r.entries[0]!.id, {
          reason: 'because',
          pin: '000000',
        }),
      ),
    ).not.toBe('ok');
    expect((await view()).entries.find((e) => e.id === r.entries[0]!.id)!.reversed).toBe(false);
  });

  it('forecasts the next days: the balance, the couriers cash arriving, the fixed costs going out', async () => {
    const total = (await view()).totalMinor;
    const fc = await cashbookForecast(f.deps(), f.who(owner, f.storeA), 600_000);
    expect(fc.days).toHaveLength(14);
    expect(fc.days.reduce((s, d) => s + d.inMinor, 0)).toBe(600_000);
    expect(fc.days.at(-1)!.balanceMinor).toBe(total + 600_000 - fc.fixedMinor);
    expect(fc.fixedCovered).toBe(true);
  });

  it('the switch stops recording and reversing (reading stays), and another store never sees these accounts', async () => {
    f.overrides.set('books.cash@' + f.storeA, {
      enabled: false,
      forecastDays: 14,
      codPayoutDays: 5,
    });
    expect(
      await code(
        put(owner, {
          kind: 'OTHER_IN',
          accountKey: 'cash',
          amountMinor: 10,
          requestKey: key(),
        }),
      ),
    ).toBe('CASH_OFF');
    expect(await code(view())).toBe('ok');
    expect((await view()).enabled).toBe(false);
    f.overrides.delete('books.cash@' + f.storeA);
    const other = await view(f.storeB);
    expect(other.totalMinor).toBe(0);
    expect(other.entries).toEqual([]);
    const mine = (await view()).entries[0]!.id;
    expect(
      await code(
        reverseCash(f.deps(), f.who(owner, f.storeB), mine, {
          reason: 'not yours',
          pin: PIN,
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('adds an account once and keeps it (archived, never deleted)', async () => {
    const a = await addCashAccount(f.deps(), f.who(owner, f.storeA), {
      key: 'rocket',
      nameEn: 'Rocket',
      nameBn: 'রকেট',
      kind: 'MOBILE',
    });
    expect(a.balanceMinor).toBe(0);
    expect(
      await code(
        addCashAccount(f.deps(), f.who(owner, f.storeA), {
          key: 'rocket',
          nameEn: 'Rocket',
          kind: 'MOBILE',
        }),
      ),
    ).toBe('CONFLICT');
    expect(
      await code(
        addCashAccount(f.deps(), f.who(reader, f.storeA), {
          key: 'petty',
          nameEn: 'Petty',
          kind: 'CASH',
        }),
      ),
    ).toBe('FORBIDDEN');
    const v = await view();
    expect(v.accounts.map((x) => x.key)).toContain('rocket');
    expect(v.accounts.length).toBe(5);
  });
});
