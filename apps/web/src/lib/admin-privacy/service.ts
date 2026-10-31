// S18 · PR 382 — SET-08d Settings › Privacy & data (docs/BACKEND-ARCHITECTURE.md §5.13, CUS-07 §5.5; decision D9): how
// long an order keeps the IP, device and shared location for the risk checks (`risk.capture` retentionDays, PR 159) and
// how often the purge runs, the purge's last run and how many orders still hold those facts (and how many are past the
// period: they should be none), the switch for customers' erasure requests (`privacy.erasureRequests`, off), and the
// requests themselves (`customers.privacy`; the owner alone carries one out, @extas/customers erasure.ts). Seeing needs
// `security.read`, saving the card `security.write`. The mother store's values (the shop the admin runs).
import { createHash } from 'node:crypto';
import { audit, isOwner, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { carryOutErasure, cancelErasure, listErasureRequests, requestErasure, type ErasureRow } from '@extas/customers';
import { phoneForms } from '@extas/orders';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { registry, storeTarget } from '@extas/settings';
import type { AppResolver } from '../settings';

export interface PrivacyDeps {
  db: PrismaClient;
  resolver: AppResolver;
  now?: () => Date;
}
export interface PrivacyWho {
  actor: Actor;
  ctx: RequestContext;
}

/** The one card: field → setting (and its part). */
export const KEEP_FIELDS = {
  retentionDays: { key: 'risk.capture', sub: 'retentionDays' },
  purgeEveryMinutes: { key: 'risk.capture', sub: 'purgeEveryMinutes' },
  erasureRequests: { key: 'privacy.erasureRequests' },
} as const;
type KeepField = keyof typeof KEEP_FIELDS;

export interface KeepCard {
  key: 'keep';
  value: Record<KeepField, unknown>;
  byDefault: Record<KeepField, unknown>;
  version: string;
}

export interface PrivacyRequestRow extends Omit<ErasureRow, 'customerId'> {
  customerId: string;
  /** The person's name while not erased; the last three digits of his number. */
  name: string | null;
  phoneEnd: string | null;
}

export interface PrivacyView {
  cards: { keep: KeepCard };
  purge: { lastRun: { status: string; at: string } | null; holding: number; overdue: number };
  /** null: the person may not see the requests (`customers.privacy`). */
  requests: PrivacyRequestRow[] | null;
  canRequest: boolean;
  canErase: boolean;
}

export class PrivacyPageError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE' | 'NOT_FOUND',
    readonly status: number,
    readonly details: string[] = [],
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
export const isPrivacyPageError = (e: unknown): e is PrivacyPageError => e instanceof PrivacyPageError;

const S = MOTHER_STORE_ID;
const DAY = 86_400_000;
const PURGE_JOB = 'orders.pii.purge';
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const HOLDS = [{ ip: { not: null } }, { deviceId: { not: null } }, { gpsLat: { not: null } }, { gpsLng: { not: null } }];

async function keepCard(deps: PrivacyDeps): Promise<KeepCard> {
  const [cap, erasure] = await Promise.all([deps.resolver.value('risk.capture', { storeId: S }), deps.resolver.value('privacy.erasureRequests', { storeId: S })]);
  const value = { retentionDays: cap.retentionDays, purgeEveryMinutes: cap.purgeEveryMinutes, erasureRequests: erasure };
  const capDefault = registry['risk.capture'].default;
  const byDefault = { retentionDays: capDefault.retentionDays, purgeEveryMinutes: capDefault.purgeEveryMinutes, erasureRequests: registry['privacy.erasureRequests'].default };
  return { key: 'keep', value, byDefault, version: versionOf(value) };
}

const customersDeps = (deps: PrivacyDeps) => ({ db: deps.db, settings: deps.resolver, now: deps.now });
const whoIn = (who: PrivacyWho) => ({ actor: who.actor, storeId: S, ctx: who.ctx });

/** The page's data (`security.read`). */
export async function privacyView(deps: PrivacyDeps, who: PrivacyWho): Promise<PrivacyView> {
  const held = await requirePermission(deps.db, who.actor, 'security.read', { storeId: S });
  const now = deps.now?.() ?? new Date();
  const keep = await keepCard(deps);
  const days = keep.value.retentionDays as number;
  const [last, holding, overdue] = await Promise.all([
    deps.db.jobRun.findFirst({ where: { jobKey: PURGE_JOB, storeId: S, status: { not: 'RUNNING' } }, orderBy: { startedAt: 'desc' }, select: { status: true, finishedAt: true, startedAt: true } }),
    deps.db.order.count({ where: { storeId: S, OR: HOLDS } }),
    deps.db.order.count({ where: { storeId: S, OR: HOLDS, placedAt: { lt: new Date(now.getTime() - days * DAY) } } }),
  ]);
  const canRequest = held.has('customers.privacy');
  const canErase = canRequest && !!who.actor.staffUserId && (await isOwner(deps.db, who.actor.staffUserId));
  let requests: PrivacyRequestRow[] | null = null;
  if (canRequest) {
    const size = await deps.resolver.value('privacy.requestsListSize');
    const rows = await listErasureRequests(customersDeps(deps), whoIn(who), size);
    const people = rows.length ? await deps.db.customer.findMany({ where: { id: { in: rows.map((r) => r.customerId) } }, select: { id: true, name: true, phone: true, erasedAt: true } }) : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    requests = rows.map((r) => {
      const p = byId.get(r.customerId);
      const live = p && !p.erasedAt;
      return { ...r, name: live ? (p.name ?? null) : null, phoneEnd: live && p.phone ? p.phone.slice(-3) : null };
    });
  }
  return {
    cards: { keep },
    purge: { lastRun: last ? { status: last.status, at: (last.finishedAt ?? last.startedAt).toISOString() } : null, holding, overdue },
    requests,
    canRequest,
    canErase,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Saves the card whole (`security.write`); a stale version is refused with the fresh one. */
export async function saveKeepCard(deps: PrivacyDeps, who: PrivacyWho, input: unknown): Promise<PrivacyView> {
  await requirePermission(deps.db, who.actor, 'security.write', { storeId: S });
  if (!isObj(input) || input.key !== 'keep' || !isObj(input.value)) throw new PrivacyPageError('INVALID_INPUT', 400, ['key', 'value']);
  const sent = input.value;
  const unknownFields = Object.keys(sent).filter((k) => !(k in KEEP_FIELDS));
  if (unknownFields.length) throw new PrivacyPageError('INVALID_INPUT', 400, unknownFields);
  const before = await keepCard(deps);
  if (input.version !== undefined && input.version !== before.version) throw new PrivacyPageError('STALE', 409, ['version'], { version: before.version });
  const cap = structuredClone(await deps.resolver.value('risk.capture', { storeId: S }));
  if ('retentionDays' in sent) (cap as Record<string, unknown>).retentionDays = sent.retentionDays;
  if ('purgeEveryMinutes' in sent) (cap as Record<string, unknown>).purgeEveryMinutes = sent.purgeEveryMinutes;
  const erasure = 'erasureRequests' in sent ? sent.erasureRequests : before.value.erasureRequests;
  const capOk = registry['risk.capture'].schema.safeParse(cap);
  const erasureOk = registry['privacy.erasureRequests'].schema.safeParse(erasure);
  const bad = [...(capOk.success ? [] : capOk.error.issues.map((i) => `risk.capture.${i.path.join('.')}: ${i.message}`)), ...(erasureOk.success ? [] : ['privacy.erasureRequests'])];
  if (bad.length || !capOk.success || !erasureOk.success) throw new PrivacyPageError('INVALID_INPUT', 400, bad);
  const after = { retentionDays: capOk.data.retentionDays, purgeEveryMinutes: capOk.data.purgeEveryMinutes, erasureRequests: erasureOk.data };
  if (versionOf(after) === before.version) return privacyView(deps, who);
  const meta = { actorId: who.actor.staffUserId ?? null, reason: 'Settings › Privacy & data' };
  const target = storeTarget(S);
  if (after.retentionDays !== before.value.retentionDays || after.purgeEveryMinutes !== before.value.purgeEveryMinutes) await deps.resolver.set('risk.capture', capOk.data, target, meta);
  if (after.erasureRequests !== before.value.erasureRequests) await deps.resolver.set('privacy.erasureRequests', erasureOk.data, target, meta);
  await audit(deps.db, who.actor, { storeId: S, action: 'privacy.settings.save', entityType: 'Setting', entityId: 'keep', before: before.value, after }, who.ctx);
  return privacyView(deps, who);
}

/** Files a request for the customer with this number (`customers.privacy`; the service checks the switch). */
export async function fileRequest(deps: PrivacyDeps, who: PrivacyWho, input: { phone?: unknown; reason?: unknown }): Promise<ErasureRow> {
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const forms = phoneForms(phone);
  if (!phone || !forms.length) throw new PrivacyPageError('INVALID_INPUT', 400, ['phone']);
  await requirePermission(deps.db, who.actor, 'customers.privacy', { storeId: S });
  const c = await deps.db.customer.findFirst({ where: { storeId: S, erasedAt: null, OR: [{ phone: { in: forms } }, { whatsappNumber: { in: forms } }] }, select: { id: true } });
  if (!c) throw new PrivacyPageError('NOT_FOUND', 404, ['phone']);
  return requestErasure(customersDeps(deps), whoIn(who), { customerId: c.id, reason: input.reason });
}

export const cancelRequest = (deps: PrivacyDeps, who: PrivacyWho, requestId: string) => cancelErasure(customersDeps(deps), whoIn(who), requestId);

/** The owner carries a request out; `words` are the confirmation word in each admin language (from the page's words). */
export function eraseNow(deps: PrivacyDeps, who: PrivacyWho, requestId: string, confirm: string, words: readonly string[]) {
  const typed = confirm.trim();
  const expected = words.find((w) => w.trim() === typed) ?? words[0] ?? '';
  return carryOutErasure(customersDeps(deps), whoIn(who), { requestId, confirm: typed, expected });
}
