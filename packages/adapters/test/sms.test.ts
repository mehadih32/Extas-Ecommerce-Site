// PR 130 — the mock SMS sender: nothing leaves the server, the outbox keeps the newest messages, a bad number is refused.
import { describe, expect, it } from 'vitest';
import { allAdapters, mockSmsAdapter, mockSmsOutbox, smsAdapters } from '../src';

const ctx = { mode: 'MOCK' as const, config: {}, storeId: 1, secret: async () => null };

describe('mock SMS (PR 130)', () => {
  it('sends into the outbox and the newest message to a number is found', async () => {
    mockSmsOutbox.clear();
    const s = await mockSmsAdapter.mock(ctx);
    expect(await s.send({ to: '+8801700000130', text: 'one', purpose: 'account.code' })).toMatchObject({ ok: true });
    expect(await s.send({ to: '+8801700000130', text: 'two', purpose: 'account.code' })).toMatchObject({ ok: true });
    expect(mockSmsOutbox.lastTo('+8801700000130')?.text).toBe('two');
    expect(mockSmsOutbox.all()).toHaveLength(2);
  });

  it('refuses a number that is not in +country form', async () => {
    const s = await mockSmsAdapter.mock(ctx);
    expect(await s.send({ to: '01700000130', text: 'x', purpose: 'account.code' })).toEqual({ ok: false, error: expect.any(String) });
  });

  it('keeps only the newest messages', async () => {
    mockSmsOutbox.clear();
    const s = await mockSmsAdapter.mock(ctx);
    for (let i = 0; i < 205; i++) await s.send({ to: '+8801700000130', text: String(i), purpose: 'p' });
    expect(mockSmsOutbox.all()).toHaveLength(200);
    expect(mockSmsOutbox.all()[0]?.text).toBe('5');
  });

  it('has no live mode, no key, and stays out of Keys & connections until the gateway comes', async () => {
    expect(mockSmsAdapter.modes).toEqual([]);
    expect(mockSmsAdapter.secrets).toEqual([]);
    expect(smsAdapters).toContain(mockSmsAdapter);
    expect(allAdapters.some((a) => a.kind === 'SMS')).toBe(false);
    await expect(mockSmsAdapter.create(ctx)).rejects.toThrow();
  });
});
