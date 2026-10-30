// PR 620 — "Keys & connections" with an optional key: the ERP's signing secret (the third field of the ERP connection).
// Left empty it is not asked for, not saved and not needed for the connection to count as saved (the webhook secret
// then checks the ERP's calls to the shop); typed in, it is saved like any key. No database: a stub connection list.
import { describe, expect, it } from 'vitest';
import { connectionCatalogue } from '@extas/adapters';
import { listConnections, parseSave } from './integrations';

const erp = connectionCatalogue.find((c) => c.id === 'extasErp')!;
const BASE = { baseUrl: 'https://erp.example.test' };

describe('PR 620 · an optional key on Keys & connections', () => {
  it('saves without the optional key, with it, and never without a required one', () => {
    expect(parseSave(erp, { secrets: { apiKey: 'k-sample', webhookSecret: 'w-sample' }, config: BASE })).toEqual({ secrets: { apiKey: 'k-sample', webhookSecret: 'w-sample' }, config: BASE });
    expect(parseSave(erp, { secrets: { apiKey: 'k-sample', webhookSecret: 'w-sample', signingSecret: '  ' }, config: BASE })).toEqual({ secrets: { apiKey: 'k-sample', webhookSecret: 'w-sample' }, config: BASE });
    expect(parseSave(erp, { secrets: { apiKey: 'k-sample', webhookSecret: 'w-sample', signingSecret: 's-sample' }, config: BASE })).toEqual({ secrets: { apiKey: 'k-sample', webhookSecret: 'w-sample', signingSecret: 's-sample' }, config: BASE });
    expect(parseSave(erp, { secrets: { webhookSecret: 'w-sample', signingSecret: 's-sample' }, config: BASE })).toEqual({ bad: ['secrets.apiKey'] });
    expect(parseSave(erp, { secrets: { apiKey: 'k', webhookSecret: 'w', signingSecret: 'x'.repeat(16_385) }, config: BASE })).toEqual({ bad: ['secrets.signingSecret'] });
  });

  it('the page marks the key optional, and the connection counts as saved with the two required keys', async () => {
    const db = { integration: { findMany: async () => [] } } as unknown as Parameters<typeof listConnections>[0];
    const at = new Date('2026-10-23T04:00:00Z');
    const vault = { list: async () => [{ name: 'extasErp.apiKey', revoked: false, updatedAt: at }, { name: 'extasErp.webhookSecret', revoked: false, updatedAt: at }] } as unknown as Parameters<typeof listConnections>[1];
    const view = (await listConnections(db, vault)).find((c) => c.id === 'extasErp')!;
    expect(view.secrets).toEqual([
      { field: 'apiKey', optional: false, set: true },
      { field: 'webhookSecret', optional: false, set: true },
      { field: 'signingSecret', optional: true, set: false },
    ]);
    expect(view.keySaved).toBe(true);
  });
});
