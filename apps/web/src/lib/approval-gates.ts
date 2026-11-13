// S28 · PR 664 (price adjust) and PR 687 (cash in/out) wired to the staff limits (PR 702) and the approvals (PR 703).
// Owner decisions of 13 Nov 2026: both ship ON; the role limits ship empty, and an empty limit means EVERY adjustment or
// cash entry waits for one approver (one is enough); the owner has no limit. The settings are `approvals.gates` (an empty
// limit may be turned into "no limit" there) and `staff.controls` (the discount limits of 702).
//   priceAdjustGate  — before an adjustment is applied: apply now, or leave it PENDING and ask an approver.
//   cashGate         — before a cash entry is recorded: record now, or leave it waiting and ask an approver.
//   askApprover      — raises the approval row (kind `price` or `cash`) and, when the owner turned it on, asks on Telegram.
//   approvalAnswer   — what a waiting entry reads back: PENDING, APPROVED or REJECTED (an answer only records it; the
//                      screen that owns the entry applies it with the owner's PIN, as before).
// Nothing here moves money: a gate only says "now" or "wait", and the owner's PIN rules of 664 and 687 stay as they are.
import type { TelegramLink } from '@extas/adapters';
import type { ApprovalGatesSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { checkDiscount, discountLimitOf, personLimits } from './staff-controls';
import { requestApproval, type ApprovalRow } from './telegram-approvals';

export type GateReason = 'NO_LIMIT_SET' | 'OVER_AMOUNT' | 'OVER_PERCENT' | 'OVER_CASH';
export type GateVerdict = { apply: true } | { apply: false; reason: GateReason; limit: number | null };

/** Who is asking: the owner, or a person with the keys of the roles they hold (none for a person without a staff account). */
export interface GatePerson {
  owner: boolean;
  roleKeys: readonly string[];
}

const APPLY: GateVerdict = { apply: true };

/** A price adjustment of `discountMinor` on `baseMinor` (the order's subtotal): now, or wait. */
export function priceVerdict(person: GatePerson, controls: { limits: Parameters<typeof discountLimitOf>[0]['limits'] }, gates: ApprovalGatesSettings, discountMinor: number, baseMinor: number): GateVerdict {
  if (person.owner || discountMinor <= 0) return APPLY;
  const limit = discountLimitOf(controls, person.roleKeys, false);
  if (limit.unlimited) return gates.priceAdjust.emptyLimitWaits ? { apply: false, reason: 'NO_LIMIT_SET', limit: null } : APPLY;
  const v = checkDiscount(limit, discountMinor, baseMinor);
  return v.ok ? APPLY : { apply: false, reason: v.reason, limit: v.limit };
}

/** A cash entry of `amountMinor` (in or out): now, or wait. The widest limit among the person's roles counts. */
export function cashVerdict(person: GatePerson, gates: ApprovalGatesSettings, amountMinor: number): GateVerdict {
  if (!gates.cash.enabled || person.owner || amountMinor <= 0) return APPLY;
  const set = person.roleKeys.map((k) => gates.cash.limits[k]).filter((v): v is number => typeof v === 'number');
  if (!set.length) return gates.cash.emptyLimitWaits ? { apply: false, reason: 'NO_LIMIT_SET', limit: null } : APPLY;
  const max = Math.max(...set);
  return amountMinor <= max ? APPLY : { apply: false, reason: 'OVER_CASH', limit: max };
}

type Deps = Pick<AdminDeps, 'db' | 'resolver'>;

export async function priceAdjustGate(deps: Deps, staffUserId: string | null, storeId: number, a: { discountMinor: number; baseMinor: number }): Promise<GateVerdict> {
  const [p, controls, gates] = await Promise.all([personLimits(deps, staffUserId, storeId), deps.resolver.value('staff.controls', { storeId }), deps.resolver.value('approvals.gates', { storeId })]);
  return priceVerdict({ owner: p.owner, roleKeys: p.roleKeys }, controls, gates, a.discountMinor, a.baseMinor);
}

export async function cashGate(deps: Deps, staffUserId: string | null, storeId: number, a: { amountMinor: number }): Promise<GateVerdict> {
  const [p, gates] = await Promise.all([personLimits(deps, staffUserId, storeId), deps.resolver.value('approvals.gates', { storeId })]);
  return cashVerdict({ owner: p.owner, roleKeys: p.roleKeys }, gates, a.amountMinor);
}

export interface AskInput {
  /** Which screen asks (`orders.priceAdjust`, `money.cash`). */
  source: string;
  title: string;
  detail?: string | null;
  amountMinor?: number | null;
  /** The waiting entry (`OrderPriceAdjustment`, `CashEntry`) and its id, so its screen reads the answer back. */
  refType: string;
  refId: string;
}

/** Raises the approval for a waiting entry. Telegram is asked only when the owner's `askTelegram` and the Telegram kind are on. */
export async function askApprover(deps: Pick<AdminDeps, 'db' | 'resolver' | 'vault' | 'now'>, storeId: number, kind: 'price' | 'cash', input: AskInput, link?: TelegramLink): Promise<{ ok: true; row: ApprovalRow; sent: boolean } | { ok: false; error: string }> {
  const gates = await deps.resolver.value('approvals.gates', { storeId });
  const ask = kind === 'price' ? gates.priceAdjust.askTelegram : gates.cash.askTelegram;
  return requestApproval(deps, storeId, { kind, source: input.source, title: input.title, detail: input.detail ?? null, amountMinor: input.amountMinor ?? null, refType: input.refType, refId: input.refId }, link, { telegram: ask });
}

/** The newest answer for a waiting entry (null when none was asked). */
export async function approvalAnswer(db: Pick<AdminDeps['db'], 'approvalRequest'>, storeId: number, refType: string, refId: string): Promise<'PENDING' | 'APPROVED' | 'REJECTED' | null> {
  const r = await db.approvalRequest.findFirst({ where: { storeId, refType, refId }, orderBy: { createdAt: 'desc' }, select: { status: true } });
  return r ? (r.status as 'PENDING' | 'APPROVED' | 'REJECTED') : null;
}
