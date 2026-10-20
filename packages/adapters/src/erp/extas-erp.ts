// PR 497, 498 — the adapter for the shop's own ERP (provider `extasErp`), built against the ERP ↔ shop API contract
// (docs/ERP-API-CONTRACT.md, CN-005). The owner types the ERP's address (config `baseUrl`), the API key and the webhook
// secret into "Keys & connections" (PR 500); the key and secret go to the vault (PR 493) as `extasErp.apiKey` and
// `extasErp.webhookSecret`. Until then, and whenever its test fails, the connection stays on MOCK and talks to the
// practice ERP (mock-erp.ts) — the shop never waits for a key (A1.3).
//
// SANDBOX and LIVE are the same client pointed at the address saved on the connection (the ERP's test system or the
// real one). The Test button calls `/health`: a pass proves the address, the key and which company the key belongs to.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import type { ErpApi } from './contract';
import { createErpHttpClient } from './http-client';
import { mockErp } from './mock-erp';

export const EXTAS_ERP_PROVIDER = 'extasErp';

/** The practice ERP's address: never resolvable on the network (RFC 6761 `.invalid`). */
export const MOCK_ERP_BASE_URL = 'https://practice-erp.invalid';

export const extasErpConfig = z.object({
  /** The ERP's address, e.g. https://erp.example.com — HTTPS only (contract). */
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500),
});
export type ExtasErpConfig = z.output<typeof extasErpConfig>;

export const extasErp = defineAdapter<ErpApi, ExtasErpConfig>({
  kind: 'ERP',
  provider: EXTAS_ERP_PROVIDER,
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['apiKey', 'webhookSecret'],
  configSchema: extasErpConfig,
  async create(ctx) {
    const apiKey = await requireSecret(ctx, 'apiKey');
    return createErpHttpClient({ baseUrl: ctx.config.baseUrl, apiKey, provider: EXTAS_ERP_PROVIDER });
  },
  async mock() {
    const world = mockErp();
    return createErpHttpClient({ baseUrl: MOCK_ERP_BASE_URL, apiKey: world.defaultKey, provider: EXTAS_ERP_PROVIDER, fetch: world.fetch });
  },
  async test(api) {
    const h = await api.health();
    return { ok: true, message: `${h.companyName} · ${h.integrationName}${h.companyId ? ` (${h.companyId})` : ''}` };
  },
});
