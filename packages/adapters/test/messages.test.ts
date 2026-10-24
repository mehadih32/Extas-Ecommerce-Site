// PR 148 — the mock WhatsApp and e-mail senders of the order journey: nothing leaves the server, a bad address is
// refused, and neither is listed in Keys & connections until its real provider comes.
import { describe, expect, it } from 'vitest';
import { allAdapters, bulkSmsBdAdapter, messageAdapters, mockEmailAdapter, mockEmailOutbox, mockSmsAdapter, mockWhatsAppAdapter, mockWhatsAppOutbox } from '../src';

const ctx = { mode: 'MOCK' as const, config: {}, storeId: 1, secret: async () => null };

describe('mock WhatsApp and e-mail (PR 148)', () => {
  it('WhatsApp: sends into the outbox, refuses a number not in +country form', async () => {
    mockWhatsAppOutbox.clear();
    const s = await mockWhatsAppAdapter.mock(ctx);
    expect(await s.send({ to: '+8801700000148', text: 'one', purpose: 'order.placed' })).toMatchObject({ ok: true });
    expect(mockWhatsAppOutbox.lastTo('+8801700000148')?.text).toBe('one');
    expect(await s.send({ to: '01700000148', text: 'x', purpose: 'p' })).toEqual({ ok: false, error: expect.any(String) });
    expect(mockWhatsAppOutbox.all()).toHaveLength(1);
  });

  it('e-mail: sends into the outbox, refuses something that is not an address', async () => {
    mockEmailOutbox.clear();
    const s = await mockEmailAdapter.mock(ctx);
    expect(await s.send({ to: 'buyer@example.com', subject: 's', text: 't', purpose: 'order.placed' })).toMatchObject({ ok: true });
    expect(mockEmailOutbox.lastTo('buyer@example.com')?.subject).toBe('s');
    expect(await s.send({ to: 'not-an-address', subject: 's', text: 't', purpose: 'p' })).toEqual({ ok: false, error: expect.any(String) });
  });

  it('keeps only the newest 200 messages', async () => {
    mockWhatsAppOutbox.clear();
    const s = await mockWhatsAppAdapter.mock(ctx);
    for (let i = 0; i < 203; i++) await s.send({ to: '+8801700000148', text: String(i), purpose: 'p' });
    expect(mockWhatsAppOutbox.all()).toHaveLength(200);
    expect(mockWhatsAppOutbox.all()[0]?.text).toBe('3');
  });

  it('no live mode, no key, not in Keys & connections; the message engine gets all three senders', async () => {
    for (const a of [mockWhatsAppAdapter, mockEmailAdapter]) {
      expect(a.modes).toEqual([]);
      expect(a.secrets).toEqual([]);
      await expect(a.create(ctx)).rejects.toThrow();
    }
    expect(allAdapters.some((a) => a.kind === 'WHATSAPP' || a.kind === 'EMAIL')).toBe(false);
    expect(messageAdapters).toEqual([mockSmsAdapter, bulkSmsBdAdapter, mockWhatsAppAdapter, mockEmailAdapter]);
  });
});
