// S18 · PR 386/362 — "Send to Cloudflare" before go-live (CN-003): with the main domain or a store's primary domain among
// the Cloudflare connection's host names, the send is refused with 409 NOT_LIVE and nothing reaches Cloudflare; once
// search engines are let in on the primary domain (the go-live switch, PR 401) the same send goes through. The
// connection and the permission check are stand-ins (no database, no token); sample host names.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShieldPlan } from '@extas/adapters';

const apply = vi.fn(async (_plan: ShieldPlan) => ({ ok: true, changed: [] as string[] }));
let hosts: string[] = [];

vi.mock('@extas/auth', async (orig) => ({
  ...(await orig<typeof import('@extas/auth')>()),
  requirePermission: vi.fn(async () => new Set(['security.read', 'security.write'])),
  isOwner: vi.fn(async () => true),
  audit: vi.fn(async () => undefined),
}));
vi.mock('@extas/adapters', async (orig) => ({
  ...(await orig<typeof import('@extas/adapters')>()),
  createConnections: () => ({
    use: async () => ({ provider: 'cloudflare', mode: 'LIVE', api: { shield: { hosts, read: async () => ({ config: [], custom: [], rate: [], cache: [] }), apply } } }),
  }),
}));

const { isEdgePageError, sendEdge } = await import('./service');
const { registry } = await import('@extas/settings');

function deps(o: { searchEngines: boolean; primary: string[] }) {
  const values: Record<string, unknown> = {
    'seo.indexing': { ...registry['seo.indexing'].default, searchEngines: o.searchEngines },
    'system.stagingHost': 'new.example.com',
  };
  const resolver = { value: async (k: string) => (k in values ? values[k] : (registry as Record<string, { default: unknown }>)[k]!.default) };
  const db = {
    storeDomain: { findMany: async () => o.primary.map((hostname) => ({ hostname })) },
    auditLog: { findFirst: async () => null },
  };
  return { db, resolver, vault: null } as never;
}
const who = { actor: { staffUserId: 'sample-owner' }, ctx: {} } as never;

describe('Send to Cloudflare before go-live (CN-003)', () => {
  beforeEach(() => apply.mockClear());

  it('refuses the main domain and a store`s primary domain with 409 NOT_LIVE; nothing is sent', async () => {
    hosts = ['new.example.com', 'example.com', 'shop.example.org'];
    const e = await sendEdge(deps({ searchEngines: false, primary: ['shop.example.org'] }), who).catch((x: unknown) => x);
    expect(isEdgePageError(e)).toBe(true);
    expect(e).toMatchObject({ code: 'NOT_LIVE', status: 409, data: { hosts: ['example.com', 'shop.example.org'] } });
    expect(apply).not.toHaveBeenCalled();
  });

  it('sends the staging host alone before go-live, and the main domain once the go-live switch is on', async () => {
    hosts = ['new.example.com'];
    await sendEdge(deps({ searchEngines: false, primary: ['example.com'] }), who);
    hosts = ['new.example.com', 'example.com'];
    await sendEdge(deps({ searchEngines: true, primary: ['example.com'] }), who);
    expect(apply.mock.calls.map((c) => c[0].hosts)).toEqual([['new.example.com'], ['new.example.com', 'example.com']]);
  });
});
