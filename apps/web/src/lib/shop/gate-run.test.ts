// PR 170 follow-up (go-live gate, live run 1 Nov) — the gate's run grant: only the gate's own cookie, on the host its
// grant names, while the grant is open, reads the practice gateway as on; nothing else changes.
import { describe, expect, it, vi } from 'vitest';
import { grantAllows, gateRunSettings, parseGateCookie, plainHost, tokenHash, type GateGrant } from './gate-run';

const token = 'a'.repeat(64);
const now = new Date('2026-11-01T12:00:00Z');
const grant = (over: Partial<GateGrant> = {}): GateGrant => ({ requestHash: tokenHash(token), responseBody: { host: 'new.example.test' }, expiresAt: new Date('2026-11-01T13:00:00Z'), completedAt: null, ...over });
const base = { token, host: 'new.example.test', now, stagingHost: 'new.example.test', storeHosts: [] as string[] };

describe('parseGateCookie', () => {
  it('takes <run id>.<64 hex>', () => {
    expect(parseGateCookie(`20261101120000.${token}`)).toEqual({ runId: '20261101120000', token });
  });
  it('refuses anything else', () => {
    for (const v of [null, '', token, `.${token}`, `run.${token.slice(1)}`, `run.${token.toUpperCase()}`, `a b.${token}`, `${'x'.repeat(25)}.${token}`]) expect(parseGateCookie(v)).toBeNull();
  });
});

describe('plainHost', () => {
  it('prefers the forwarded host, without a port, in lower case', () => {
    expect(plainHost('New.Example.Test:443, proxy', 'internal:3000')).toBe('new.example.test');
    expect(plainHost(null, '127.0.0.1:3106')).toBe('127.0.0.1');
    expect(plainHost(null, null)).toBe('');
  });
});

describe('grantAllows', () => {
  it('an open grant, its host, its token', () => {
    expect(grantAllows(grant(), base)).toBe(true);
  });
  it('never a closed, expired or missing grant', () => {
    expect(grantAllows(null, base)).toBe(false);
    expect(grantAllows(grant({ completedAt: now }), base)).toBe(false);
    expect(grantAllows(grant({ expiresAt: now }), base)).toBe(false);
  });
  it('never another token', () => {
    expect(grantAllows(grant(), { ...base, token: 'b'.repeat(64) })).toBe(false);
  });
  it('never another host, a host other than the saved preview host, or a host the shop sells on', () => {
    expect(grantAllows(grant(), { ...base, host: 'shop.example.test' })).toBe(false);
    expect(grantAllows(grant(), { ...base, stagingHost: 'other.example.test' })).toBe(false);
    expect(grantAllows(grant(), { ...base, storeHosts: ['New.Example.Test'] })).toBe(false);
    expect(grantAllows(grant({ responseBody: null }), base)).toBe(false);
  });
  it('a shop with no saved preview host still needs the grant host', () => {
    expect(grantAllows(grant(), { ...base, stagingHost: null })).toBe(true);
  });
});

describe('gateRunSettings', () => {
  const reader = (testPayments: boolean) => ({ value: vi.fn(async (key: string) => (key === 'payments.testPayments' ? testPayments : 'other')) }) as never;
  it('reads payments.testPayments as on only while the run is on', async () => {
    const on = vi.fn(async () => true);
    expect(await gateRunSettings(reader(false), on).value('payments.testPayments')).toBe(true);
    expect(await gateRunSettings(reader(false), async () => false).value('payments.testPayments')).toBe(false);
  });
  it('never asks for any other key, nor when test payments are on anyway', async () => {
    const on = vi.fn(async () => true);
    expect(await gateRunSettings(reader(false), on).value('payment.cod.enabled')).toBe('other');
    expect(await gateRunSettings(reader(true), on).value('payments.testPayments')).toBe(true);
    expect(on).not.toHaveBeenCalled();
  });
  it('outside a request (no cookies) it is off', async () => {
    expect(await gateRunSettings(reader(false)).value('payments.testPayments')).toBe(false);
  });
});
