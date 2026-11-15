// PR 817 (prototype v5 m-settings.js `renderPayments` › "Where the money lands") — which of the owner's accounts each way of paying
// settles into (bKash, Nagad, card, cash from couriers) and in how many working days. A note the owner keeps and the books read:
// it moves no money and changes no price. One settings-registry value, `payments.settlement` (owner data, empty as shipped). Only an
// owner may change it (it says where money lands), with `settings.write`, written through the settings history. Words:
// messages/admin-checkout.*.json (`ck.settle.*`).
import { isOwner, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import type { PrismaClient } from '@extas/db/client';
import { INSTALLATION, PAYMENTS_SETTLEMENT_DEFAULT, paymentsSettlementSchema, SETTLEMENT_METHODS, type PaymentsSettlementSettings } from '@extas/settings';
import type { AppResolver } from '../settings';

export interface SettlementDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value' | 'set'>;
}
export interface SettlementWho {
  actor: Actor;
  ctx?: RequestContext;
}

export class SettlementError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details: string[] = [],
  ) {
    super(code);
  }
}

export async function settlementRead(resolver: Pick<AppResolver, 'value'>, storeId: number): Promise<PaymentsSettlementSettings> {
  return (await resolver.value('payments.settlement', { storeId })) ?? PAYMENTS_SETTLEMENT_DEFAULT;
}

/** Clean what the owner typed: the account names (trimmed, no empty, no repeat), and a way may only name an account on that list. */
export function parseSettlement(input: unknown): PaymentsSettlementSettings {
  const o = typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  if (!o) throw new SettlementError(400, 'INVALID_INPUT', ['body']);
  const accounts = Array.isArray(o.accounts) ? Array.from(new Set(o.accounts.map((a) => (typeof a === 'string' ? a.trim() : '')).filter(Boolean))) : [];
  const r = paymentsSettlementSchema.safeParse({ ...o, accounts });
  if (!r.success) throw new SettlementError(400, 'INVALID_INPUT', r.error.issues.map((i) => i.path.join('.')));
  const bad = SETTLEMENT_METHODS.filter((m) => r.data[m].account !== '' && !r.data.accounts.includes(r.data[m].account));
  if (bad.length) throw new SettlementError(400, 'ACCOUNT_NOT_LISTED', [...bad]);
  return r.data;
}

export async function settlementSave(deps: SettlementDeps, who: SettlementWho, input: unknown, storeId: number): Promise<PaymentsSettlementSettings> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId });
  if (!who.actor.staffUserId || !(await isOwner(deps.db, who.actor.staffUserId))) throw new SettlementError(403, 'FORBIDDEN', ['owner']);
  const next = parseSettlement(input);
  await deps.resolver.set('payments.settlement', next, INSTALLATION, { actorId: who.actor.staffUserId, reason: 'Settings › Payments: where the money lands' });
  return next;
}
