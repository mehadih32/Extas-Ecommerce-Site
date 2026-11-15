// PR 815 — Settings › Security: which addresses the wrong-password pause holds now, and that a blocked address is refused at the
// admin's doors (and the server's break-glass switch opens them again).
import { describe, expect, it } from 'vitest';
import { addressBlocked, addressRefused, ALLOWLIST_BREAK_GLASS_ENV } from './access';
import { waitingAddresses } from './board';

const NOW = new Date('2026-11-15T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

describe('PR 815 · waiting addresses', () => {
  it('holds an address with max wrong tries inside the window, until the last try plus the pause', () => {
    const fails = [...Array.from({ length: 10 }, (_, i) => ({ ip: '45.142.212.61', at: ago(9 - i) })), { ip: '10.0.0.9', at: ago(2) }];
    const w = waitingAddresses(fails, 10, 10, NOW);
    expect(w).toHaveLength(1);
    expect(w[0]!.ip).toBe('45.142.212.61');
    expect(w[0]!.until.getTime()).toBe(NOW.getTime() + 10 * 60_000);
  });
  it('ignores tries outside the window and tries with no address', () => {
    const fails = [...Array.from({ length: 12 }, () => ({ ip: '1.2.3.4', at: ago(30) })), ...Array.from({ length: 12 }, () => ({ ip: null, at: ago(1) }))];
    expect(waitingAddresses(fails, 10, 10, NOW)).toEqual([]);
  });
});

const resolverWith = (list: { ip: string }[], allow = { enabled: false, entries: [] as string[] }) => ({
  value: async (k: string) => (k === 'security.blockedAddresses' ? { list } : allow),
});

describe('PR 815 · blocked addresses at the door', () => {
  it('refuses a listed address, also a range, and lets others through', async () => {
    const r = resolverWith([{ ip: '45.142.212.61' }, { ip: '203.0.113.0/24' }]);
    expect(await addressRefused(r as never, '45.142.212.61', {})).toBe(true);
    expect(await addressRefused(r as never, '203.0.113.77', {})).toBe(true);
    expect(await addressRefused(r as never, '198.51.100.5', {})).toBe(false);
  });
  it('the break-glass switch opens the admin again, and an unreadable setting blocks nobody', async () => {
    const r = resolverWith([{ ip: '45.142.212.61' }]);
    expect(await addressBlocked(r as never, '45.142.212.61', { [ALLOWLIST_BREAK_GLASS_ENV]: '1' })).toBe(false);
    const broken = { value: async () => { throw new Error('no setting'); } };
    expect(await addressBlocked(broken as never, '45.142.212.61', {})).toBe(false);
  });
});
