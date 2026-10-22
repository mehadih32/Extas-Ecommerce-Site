// PR 553 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the server's own quote of a finished address,
// the one an order keeps. As shipped every band is off, so a settled line quotes "not set", never 0; once the owner
// switches a band on with its charge, the line quotes that figure; an ambiguous line has no area and no quote.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { isResolvedArea, quoteLine } from '../src';
import { codeOf, setUp, type Fixture } from './fixture';

describe.skipIf(!HAS_TEST_DB)('the charge quote on PostgreSQL (PR 553)', () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await setUp('delivery_quote');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('quotes "not set" while the band is off, the owner\'s figure once it is on', async () => {
    const off = await quoteLine(f.deps(), f.A, { line: 'Masterpara, Gabtali, Bogura' });
    expect(off.status).toBe('resolved');
    if (off.status !== 'resolved') return;
    expect(isResolvedArea(off.area)).toBe(true);
    expect(off.quote).toMatchObject({ kind: 'not-set', band: { key: 'outside-dhaka', chargeMinor: null } });

    await f.t.prisma.deliveryBand.update({ where: { id: await f.band('outside-dhaka') }, data: { enabled: true, chargeMinor: 13000 } });
    const on = await quoteLine(f.deps(), f.A, { line: 'Masterpara, Gabtali, Bogura' });
    expect(on.status === 'resolved' && on.quote).toMatchObject({ kind: 'charge', chargeMinor: 13000 });
  });

  it('has no quote for a line that asks, and checks its input and store', async () => {
    const ask = await quoteLine(f.deps(), f.A, { line: 'Gabtoli' });
    expect(ask.status).toBe('ask');
    expect('quote' in ask).toBe(false);
    expect(await codeOf(quoteLine(f.deps(), f.A, { line: 'Gabtoli', chargeMinor: 0 }))).toBe('INVALID_INPUT');
    expect(await codeOf(quoteLine(f.deps(), 99_999, { line: 'Gabtoli' }))).toBe('NOT_FOUND');
  });
});
