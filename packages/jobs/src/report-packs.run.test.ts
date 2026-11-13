// S28 · PR 690 follow-up — a scheduled pack goes to the owner's Telegram and, when asked for, to the owner's own e-mail address.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@extas/inventory', () => ({ profitReport: async () => ({ salesMinor: 250_000, netProfitMinor: null }) }));
vi.mock('@extas/adapters', () => ({ sendOwnerAlert: vi.fn(async () => ({ ok: true })) }));

import { sendOwnerAlert } from '@extas/adapters';
import { runReportPack } from './report-packs';

const NOW = new Date('2026-12-01T05:00:00Z');
function deps(over: { channels: string[]; email?: string | null; owner?: boolean; mail?: boolean; last?: Date | null }) {
  const sent: { to: string; subject: string | null; text: string; purpose: string }[] = [];
  const update = vi.fn(async () => ({}));
  const d = {
    now: () => NOW,
    db: { reportSchedule: { findUnique: async () => ({ id: 'r1', enabled: true, channels: over.channels, lastSentAt: over.last ?? null }), update } },
    settings: { value: async (k: string) => (k === 'reports.digest.ownerEmail' ? (over.email ?? null) : k === 'store.timeZone' ? 'Asia/Dhaka' : 'BDT') },
    owner: over.owner === false ? undefined : { telegram: {} },
    messages: over.mail === false ? undefined : { sender: async () => ({ send: async (m: never) => (sent.push(m), { ok: true as const, messageId: 'm1' }) }) },
  };
  return { d: d as never, sent, update };
}
const payload = { storeId: 1, pack: 'bank', period: 'M:2026-12' };

describe('S28 · PR 690 · a scheduled pack reaches the owner', () => {
  it('sends the summary by e-mail to the owner address, only the owner', async () => {
    const { d, sent, update } = deps({ channels: ['email'], email: 'owner@example.test' });
    expect(await runReportPack(d, payload)).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'owner@example.test', purpose: 'report.pack' });
    expect(sent[0]!.text).toContain('Net profit not known yet');
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('sends nothing by e-mail while the owner has not typed his address', async () => {
    const { d, sent, update } = deps({ channels: ['email'], email: null });
    expect(await runReportPack(d, payload)).toEqual({ sent: false, reason: 'no-email' });
    expect(sent).toHaveLength(0);
    expect(update).not.toHaveBeenCalled();
  });
  it('both channels go out once; an already-sent day is not sent again', async () => {
    const both = deps({ channels: ['telegram', 'email'], email: 'owner@example.test' });
    expect(await runReportPack(both.d, payload)).toEqual({ sent: true });
    expect(sendOwnerAlert).toHaveBeenCalledTimes(1);
    expect(both.sent).toHaveLength(1);
    const again = deps({ channels: ['email'], email: 'owner@example.test', last: NOW });
    expect(await runReportPack(again.d, payload)).toEqual({ sent: false, reason: 'already' });
    expect(again.sent).toHaveLength(0);
  });

  it('the daily business report tells the day: sales, net profit and the orders waiting for tomorrow', async () => {
    const { d, update } = deps({ channels: ['telegram'] });
    (d as unknown as { db: Record<string, unknown> }).db.order = { count: async () => 3 };
    expect(await runReportPack(d, { storeId: 1, pack: 'daily', period: 'D:2026-12-01' })).toEqual({ sent: true });
    const text = vi.mocked(sendOwnerAlert).mock.calls.at(-1)![1] as string;
    expect(text).toContain('Daily business report');
    expect(text).toContain('2026-12-01');
    expect(text).toContain('Orders waiting for confirmation: 3');
    expect(update).toHaveBeenCalledTimes(1);
  });
});
