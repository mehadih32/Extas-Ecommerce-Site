// PR 497, 498 — the adapter for the shop's own ERP (provider `extasErp`), built against the ERP ↔ shop API contract
// (docs/ERP-API-CONTRACT.md, CN-005). The owner types the ERP's address (config `baseUrl`), the API key and the webhook
// secret into "Keys & connections" (PR 500); the key and secret go to the vault (PR 493) as `extasErp.apiKey` and
// `extasErp.webhookSecret`. Until then, and whenever its test fails, the connection stays on MOCK and talks to the
// practice ERP (mock-erp.ts) — the shop never waits for a key (A1.3).
//
// CN-029 §16 (PR 607): one store = one ERP company. In contract v6 each store has its own connection row (storeId set)
// with its own secrets in the vault under the store's id (the connection reads them with the store's id in ctx). The
// API key, the webhook secret and (PR 620) the signing secret the ERP's own calls to the shop are checked with
// (`extasErp.signingSecret`, ERP_LINK_SECRET_FIELDS) are this adapter's `secrets`. The signing secret is optional: left
// empty, the webhook secret checks those calls too, as the contract says (site-changes-v6 §2.7). An
// installation-wide row (one key for several stores) is refused for a v6 store (the guard's SHARED_LINK). On MOCK each store gets its own practice
// company and key (`MockErpWorld.companyForStore`), so practice data of one store never reaches another.
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
  secrets: ['apiKey', 'webhookSecret', 'signingSecret'],
  configSchema: extasErpConfig,
  async create(ctx) {
    const apiKey = await requireSecret(ctx, 'apiKey');
    return createErpHttpClient({ baseUrl: ctx.config.baseUrl, apiKey, provider: EXTAS_ERP_PROVIDER });
  },
  async mock(ctx) {
    const world = mockErp();
    return createErpHttpClient({ baseUrl: MOCK_ERP_BASE_URL, apiKey: world.keyFor(world.companyForStore(ctx.storeId)), provider: EXTAS_ERP_PROVIDER, fetch: world.fetch });
  },
  async test(api) {
    const h = await api.health();
    return { ok: true, message: `${h.companyName} · ${h.integrationName}${h.companyId ? ` (${h.companyId})` : ''}` };
  },
});
