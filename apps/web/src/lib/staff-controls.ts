// S28 · PR 702 (admin prototype v5, GAP-MAP part 3 X1-X3, X8, N11; part 1 R-16) — Staff controls: what each role may do
// with money and with customers' details, and the end-of-day cash / bKash sheet.
//
//   - Discount limit per role (`staff.controls` setting: Tk and percent, empty = no limit). `checkDiscount` is what the
//     order price adjust (PR 664) and any discount a person types asks before it is applied: within the limit it goes
//     on; above it the owner must approve. The owner has no limit. A person with several roles gets the widest limit
//     among them (a role with no limit set is unlimited).
//   - Export rows: `orders.export`, `orders.exportPersonal`, `catalogue.export`, `customers.export` shown per role,
//     read-only (a role's keys are changed in Roles, never here).
//   - Hide phone and address: a role with `hideContact` sees "01•••••4521" and "Dhanmondi, Dhaka" on the order screens'
//     data (enough to pack, never enough to copy). Applied to every order GET answer (lib/orders-api.ts `handle`).
//     The owner always sees everything; a person with any hiding role is hidden (the safer side).
//   - Handover: each desk staff member writes the cash and wallet money they took today (counted) next to what the
//     shop's own payments say (expected, `Payment.recordedById` on the day); a newer count for the same day, method and
//     person replaces the older one on the screen, the older stays as history. Nothing here moves money.
// Saving the limits needs `settings.write` and the owner's PIN (they touch money). Handover needs `orders.read` (own row)
// and is read for all by `staff.read`.
import { z } from 'zod';
import { audit, createRole, isOwner, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { dayStart, nextDay, ymdIn } from '@extas/metrics';
import { staffControlsSchema, storeTarget, type StaffControls, type StaffRoleLimit } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { requireOwnerPin } from './owner-pin';

type Db = PrismaClient;

/** The export keys shown per role (read-only rows). */
export const EXPORT_KEYS = ['orders.export', 'orders.exportPersonal', 'catalogue.export', 'customers.export'] as const;
/** What a packer may open: pack and print, no money, no customers' contact (the preset the screen offers). */
export const PACKER_PRESET = ['fulfilment.read', 'fulfilment.pack', 'orders.read'] as const;

/* ---------- pure ---------- */

/** "01712345678" → "01•••••5678": the first two and the last four digits stay. */
export function maskPhone(phone: string): string {
  const keep = (d: string) => (d.length <= 6 ? '•'.repeat(d.length) : `${d.slice(0, 2)}${'•'.repeat(d.length - 6)}${d.slice(-4)}`);
  return phone.replace(/\d[\d\s-]*\d/, (m) => {
    const digits = m.replace(/[\s-]/g, '');
    return keep(digits);
  });
}

/** "House 4, Road 2, Dhanmondi, Dhaka" → "Dhanmondi, Dhaka": the last two parts stay; one part alone is hidden. */
export function maskAddress(address: string): string {
  const parts = address.split(/[,،]/).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(', ') : '•••';
}

const PHONE_KEYS = new Set(['phone', 'customerphone', 'receiverphone', 'recipientphone', 'mobile', 'contactphone', 'shipphone']);
const ADDRESS_KEYS = new Set(['address', 'addressline', 'customeraddress', 'deliveryaddress', 'shippingaddress', 'receiveraddress', 'addresslatin', 'line1']);

/** A copy of an answer with every phone and address field hidden (an array or an object, any depth). */
export function maskContactDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(maskContactDeep) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (typeof v === 'string' && PHONE_KEYS.has(key)) out[k] = maskPhone(v);
      else if (typeof v === 'string' && ADDRESS_KEYS.has(key)) out[k] = maskAddress(v);
      else out[k] = maskContactDeep(v);
    }
    return out as T;
  }
  return value;
}

export interface DiscountLimit {
  /** True when no limit applies (the owner, or a role with nothing set). */
  unlimited: boolean;
  maxMinor: number | null;
  maxPct: number | null;
}

/** The limit a person has: the widest among their roles; a role with no entry or empty boxes is unlimited. */
export function discountLimitOf(controls: Pick<StaffControls, 'limits'>, roleKeys: readonly string[], owner: boolean): DiscountLimit {
  if (owner || !roleKeys.length) return { unlimited: true, maxMinor: null, maxPct: null };
  let maxMinor: number | null = null;
  let maxPct: number | null = null;
  for (const key of roleKeys) {
    const l = controls.limits[key];
    if (!l || (l.maxDiscountMinor === null && l.maxDiscountPct === null)) return { unlimited: true, maxMinor: null, maxPct: null };
    if (l.maxDiscountMinor !== null) maxMinor = Math.max(maxMinor ?? 0, l.maxDiscountMinor);
    if (l.maxDiscountPct !== null) maxPct = Math.max(maxPct ?? 0, l.maxDiscountPct);
  }
  return { unlimited: false, maxMinor, maxPct };
}

export type DiscountVerdict = { ok: true } | { ok: false; reason: 'OVER_AMOUNT' | 'OVER_PERCENT'; limit: number };

/** Is a discount of `discountMinor` on `baseMinor` inside the limit? Above it, the owner approves. */
export function checkDiscount(limit: DiscountLimit, discountMinor: number, baseMinor: number): DiscountVerdict {
  if (limit.unlimited || discountMinor <= 0) return { ok: true };
  if (limit.maxMinor !== null && discountMinor > limit.maxMinor) return { ok: false, reason: 'OVER_AMOUNT', limit: limit.maxMinor };
  if (limit.maxPct !== null && baseMinor > 0 && (discountMinor * 100) / baseMinor > limit.maxPct) return { ok: false, reason: 'OVER_PERCENT', limit: limit.maxPct };
  return { ok: true };
}

/** Does this person see phone and address hidden? */
export function hidesContact(controls: Pick<StaffControls, 'limits'>, roleKeys: readonly string[], owner: boolean): boolean {
  if (owner) return false;
  return roleKeys.some((k) => controls.limits[k]?.hideContact === true);
}

export const WALLET_METHODS = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY'] as const;

/* ---------- database ---------- */

/** The keys of the roles a person holds in a store (all-store roles and that store's own), not archived, not revoked. */
export async function roleKeysOf(db: Db, staffUserId: string, storeId: number): Promise<string[]> {
  const rows = await db.staffRoleAssignment.findMany({ where: { staffUserId, revokedAt: null, OR: [{ storeId: null }, { storeId }], role: { archivedAt: null } }, select: { role: { select: { key: true } } } });
  return [...new Set(rows.map((r) => r.role.key))];
}

export interface PersonLimits {
  owner: boolean;
  roleKeys: string[];
  limit: DiscountLimit;
  hideContact: boolean;
}

/** The limits of one person: what the order screens and the price adjust ask. */
export async function personLimits(deps: Pick<AdminDeps, 'db' | 'resolver'>, staffUserId: string | null, storeId: number): Promise<PersonLimits> {
  if (!staffUserId) return { owner: false, roleKeys: [], limit: { unlimited: true, maxMinor: null, maxPct: null }, hideContact: false };
  const [owner, roleKeys, controls] = await Promise.all([isOwner(deps.db, staffUserId), roleKeysOf(deps.db, staffUserId, storeId), deps.resolver.value('staff.controls', { storeId })]);
  return { owner, roleKeys, limit: discountLimitOf(controls, roleKeys, owner), hideContact: hidesContact(controls, roleKeys, owner) };
}

/** For the order answers: hides a person's customer contact when their role is set to. Failing to read the limits hides (the safer side). */
export async function maskForPerson<T>(deps: Pick<AdminDeps, 'db' | 'resolver'>, staffUserId: string | null, storeId: number, answer: T): Promise<T> {
  try {
    const p = await personLimits(deps, staffUserId, storeId);
    return p.hideContact ? maskContactDeep(answer) : answer;
  } catch {
    return maskContactDeep(answer);
  }
}

export interface RoleRow {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string;
  people: number;
  limit: StaffRoleLimit;
  exports: Record<(typeof EXPORT_KEYS)[number], boolean>;
}

const EMPTY_LIMIT: StaffRoleLimit = { maxDiscountMinor: null, maxDiscountPct: null, hideContact: false };

export interface StaffControlsView {
  roles: RoleRow[];
  handover: StaffControls['handover'];
  packerPreset: readonly string[];
  hasPackerRole: boolean;
}

export async function staffControlsView(deps: Pick<AdminDeps, 'db' | 'resolver'>, storeId: number): Promise<StaffControlsView> {
  const [controls, roles] = await Promise.all([
    deps.resolver.value('staff.controls', { storeId }),
    deps.db.role.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, key: true, nameEn: true, nameBn: true, permissions: { select: { permission: { select: { key: true } } } }, assignments: { where: { revokedAt: null }, select: { staffUserId: true } } } }),
  ]);
  const rows: RoleRow[] = roles.map((r) => {
    const keys = new Set(r.permissions.map((p) => p.permission.key));
    const owner = r.key === 'owner';
    return {
      id: r.id,
      key: r.key,
      nameEn: r.nameEn,
      nameBn: r.nameBn,
      people: new Set(r.assignments.map((a) => a.staffUserId)).size,
      limit: controls.limits[r.key] ?? EMPTY_LIMIT,
      exports: Object.fromEntries(EXPORT_KEYS.map((k) => [k, owner || keys.has(k)])) as RoleRow['exports'],
    };
  });
  return { roles: rows, handover: controls.handover, packerPreset: PACKER_PRESET, hasPackerRole: rows.some((r) => r.key === 'packer') };
}

const limitsInput = z.object({
  limits: z.record(z.string(), z.object({ maxDiscountMinor: z.number().int().min(0).nullable(), maxDiscountPct: z.number().min(0).max(100).nullable(), hideContact: z.boolean() }).strict()),
  handover: z.object({ enabled: z.boolean(), time: z.string() }).strict(),
  pin: z.string().optional(),
});

export type SaveResult = { ok: true } | { ok: false; error: string; details?: string[] };

/** Saves the limits and the handover switch: a role that does not exist is refused; the owner's PIN is needed. */
export async function saveStaffControls(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, input: unknown): Promise<SaveResult> {
  const parsed = limitsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.issues.map((i) => i.path.join('.')) };
  const next = staffControlsSchema.safeParse({ limits: parsed.data.limits, handover: parsed.data.handover });
  if (!next.success) return { ok: false, error: 'INVALID_INPUT', details: next.error.issues.map((i) => i.path.join('.')) };
  const keys = new Set((await deps.db.role.findMany({ where: { archivedAt: null }, select: { key: true } })).map((r) => r.key));
  const unknown = Object.keys(next.data.limits).filter((k) => !keys.has(k));
  if (unknown.length) return { ok: false, error: 'UNKNOWN_ROLE', details: unknown };
  if (next.data.limits.owner) return { ok: false, error: 'OWNER_UNLIMITED' };
  await requireOwnerPin(deps, actor, ctx, parsed.data.pin, 'staff.controls.save', storeId);
  const before = await deps.resolver.value('staff.controls', { storeId });
  await deps.resolver.set('staff.controls', next.data, storeTarget(storeId), { actorId: actor.staffUserId ?? null, reason: 'Settings › Staff controls' });
  await audit(deps.db, actor, { action: 'staff.controls.save', entityType: 'Setting', entityId: 'staff.controls', before, after: next.data, storeId }, ctx);
  return { ok: true };
}

/** The packer preset: a role with only what packing needs and hiding the customers' phone and address (PR 702, X8). */
export async function createPackerRole(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const key = 'packer';
  if (await deps.db.role.findUnique({ where: { key } })) return { ok: false, error: 'EXISTS' };
  await createRole(deps.db, actor, { key, nameEn: 'Packer', nameBn: 'প্যাকার', descriptionEn: 'Packs and prints; does not see customers\' phone or address.', descriptionBn: 'প্যাক ও প্রিন্ট করে; কাস্টমারের ফোন ও ঠিকানা দেখে না।', permissions: [...PACKER_PRESET] }, ctx);
  const cur = await deps.resolver.value('staff.controls', { storeId });
  await deps.resolver.set('staff.controls', { ...cur, limits: { ...cur.limits, [key]: { maxDiscountMinor: 0, maxDiscountPct: 0, hideContact: true } } }, storeTarget(storeId), { actorId: actor.staffUserId ?? null, reason: 'Settings › Staff controls: packer role' }); // hardcode-ok: the preset's own zero limits, editable in the table
  return { ok: true, key };
}

/* ---------- handover ---------- */

export type HandoverMethod = 'CASH' | 'WALLET';

export interface HandoverRow {
  id: string;
  day: string;
  staffUserId: string;
  method: HandoverMethod;
  expectedMinor: number;
  countedMinor: number;
  differenceMinor: number;
  note: string | null;
  at: string;
}

/** What the shop's own payments say this person took on the shop's day, by method group. */
export async function expectedTaken(db: Db, storeId: number, staffUserId: string, day: string, timeZone: string): Promise<Record<HandoverMethod, number>> {
  const from = dayStart(day, timeZone);
  const to = dayStart(nextDay(day), timeZone);
  const rows = await db.payment.groupBy({
    by: ['method'],
    where: { storeId, recordedById: staffUserId, status: 'PAID', paidAt: { gte: from, lt: to }, method: { in: ['CASH', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY'] } },
    _sum: { receivedMinor: true, amountMinor: true },
  });
  const out: Record<HandoverMethod, number> = { CASH: 0, WALLET: 0 };
  for (const r of rows) out[r.method === 'CASH' ? 'CASH' : 'WALLET'] += r._sum.receivedMinor ?? r._sum.amountMinor ?? 0;
  return out;
}

const handoverInput = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), method: z.enum(['CASH', 'WALLET']), countedMinor: z.number().int().min(0), note: z.string().max(300).nullish(), staffUserId: z.string().optional() }).strict();

/** A person writes what they hand over; the owner (or someone with `staff.manage`) may write it for another. */
export async function submitHandover(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, input: unknown, timeZone: string, canManage: boolean): Promise<{ ok: true; row: HandoverRow } | { ok: false; error: string }> {
  const p = handoverInput.safeParse(input);
  if (!p.success) return { ok: false, error: 'INVALID_INPUT' };
  const controls = await deps.resolver.value('staff.controls', { storeId });
  if (!controls.handover.enabled) return { ok: false, error: 'HANDOVER_OFF' };
  const me = actor.staffUserId;
  if (!me) return { ok: false, error: 'FORBIDDEN' };
  const who = p.data.staffUserId ?? me;
  if (who !== me && !canManage) return { ok: false, error: 'FORBIDDEN' };
  if (!isUuid(who)) return { ok: false, error: 'INVALID_INPUT' };
  const today = ymdIn(deps.now ? deps.now() : new Date(), timeZone);
  if (p.data.day > today) return { ok: false, error: 'FUTURE_DAY' };
  const expected = (await expectedTaken(deps.db, storeId, who, p.data.day, timeZone))[p.data.method];
  const row = await deps.db.cashHandover.create({ data: { storeId, day: new Date(`${p.data.day}T00:00:00Z`), staffUserId: who, method: p.data.method, expectedMinor: expected, countedMinor: p.data.countedMinor, note: p.data.note ?? null, createdById: me } });
  await audit(deps.db, actor, { action: 'staff.handover.write', entityType: 'CashHandover', entityId: row.id, before: null, after: { day: p.data.day, method: p.data.method, expectedMinor: expected, countedMinor: p.data.countedMinor }, storeId }, ctx);
  return { ok: true, row: toRow(row) };
}

const toRow = (r: { id: string; day: Date; staffUserId: string; method: string; expectedMinor: number; countedMinor: number; note: string | null; createdAt: Date }): HandoverRow => ({
  id: r.id,
  day: r.day.toISOString().slice(0, 10),
  staffUserId: r.staffUserId,
  method: r.method as HandoverMethod,
  expectedMinor: r.expectedMinor,
  countedMinor: r.countedMinor,
  differenceMinor: r.countedMinor - r.expectedMinor,
  note: r.note,
  at: r.createdAt.toISOString(),
});

/** The newest row for each (day, person, method); the older ones are history and stay in the table. */
export function newestHandovers(rows: readonly HandoverRow[]): HandoverRow[] {
  const best = new Map<string, HandoverRow>();
  for (const r of rows) {
    const k = `${r.day}|${r.staffUserId}|${r.method}`;
    const cur = best.get(k);
    if (!cur || r.at > cur.at) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => (a.day === b.day ? a.staffUserId.localeCompare(b.staffUserId) : a.day < b.day ? 1 : -1));
}

export async function handoverSheet(db: Db, storeId: number, day: string): Promise<{ day: string; rows: HandoverRow[]; names: Record<string, string> }> {
  const rows = await db.cashHandover.findMany({ where: { storeId, day: new Date(`${day}T00:00:00Z`) }, orderBy: { createdAt: 'asc' } });
  const ids = [...new Set(rows.map((r) => r.staffUserId))];
  const staff = ids.length ? await db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
  return { day, rows: newestHandovers(rows.map(toRow)), names: Object.fromEntries(staff.map((s) => [s.id, s.displayName ?? ''])) };
}

/* ---------- routes ---------- */

/**
 * `path` is what comes after /api/admin/staff-controls (`?storeId=`, default the mother store):
 *   GET   ''                          the roles with their limits, the export rows and the handover switch (`staff.read`)
 *   POST  ''                          {limits, handover, pin} save (`settings.write` and the owner's PIN)
 *   POST  'packer-role'               make the packer role (only packing keys, phone and address hidden) (`roles.manage`)
 *   GET   'person'                    the signed-in person's own limits (any signed-in staff)
 *   GET   'handover?day=YYYY-MM-DD'   the day's sheet (`staff.read`)
 *   POST  'handover'                  {day, method, countedMinor, note?, staffUserId?} write a count
 */
export async function staffControlsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const url = new URL(request.url);
  const m = request.method.toUpperCase();
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : /^\d+$/.test(raw) ? Number(raw) : null;
  if (storeId === null) return fail(400, 'invalid-store-id');
  const [a] = path;
  try {
    if (!a) {
      if (m === 'GET') {
        const g = await guardAdmin(request, deps, { permission: 'staff.read', storeId });
        if (g instanceof Response) return g;
        return json({ ok: true, ...(await staffControlsView(deps!, storeId)) });
      }
      if (m === 'POST') {
        const g = await guardAdmin(request, deps, { permission: 'settings.write', storeId });
        if (g instanceof Response) return g;
        const r = await saveStaffControls(deps!, g.actor, g.ctx, storeId, await body(request));
        return r.ok ? json({ ok: true, ...(await staffControlsView(deps!, storeId)) }) : fail(422, r.error, r.details);
      }
      return fail(405, 'method-not-allowed');
    }
    if (a === 'packer-role' && path.length === 1 && m === 'POST') {
      const g = await guardAdmin(request, deps, { permission: 'roles.manage', storeId });
      if (g instanceof Response) return g;
      const r = await createPackerRole(deps!, g.actor, g.ctx, storeId);
      return r.ok ? json({ ok: true, ...(await staffControlsView(deps!, storeId)) }, { status: 201 }) : fail(409, r.error);
    }
    if (a === 'person' && path.length === 1 && m === 'GET') {
      const g = await guardAdmin(request, deps, { storeId });
      if (g instanceof Response) return g;
      const p = await personLimits(deps!, g.actor.staffUserId ?? null, storeId);
      return json({ ok: true, ...p });
    }
    if (a === 'handover' && path.length === 1) {
      const tz = await deps?.resolver.value('store.timeZone', { storeId });
      if (m === 'GET') {
        const g = await guardAdmin(request, deps, { permission: 'staff.read', storeId });
        if (g instanceof Response) return g;
        const day = url.searchParams.get('day') ?? ymdIn(deps!.now ? deps!.now() : new Date(), tz!);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail(400, 'INVALID_INPUT', ['day']);
        return json({ ok: true, ...(await handoverSheet(deps!.db, storeId, day)) });
      }
      if (m === 'POST') {
        const g = await guardAdmin(request, deps, { storeId });
        if (g instanceof Response) return g;
        let canManage = false;
        try {
          await requirePermission(deps!.db, g.actor, 'staff.manage', { storeId });
          canManage = true;
        } catch {
          canManage = false;
        }
        const r = await submitHandover(deps!, g.actor, g.ctx, storeId, await body(request), tz!, canManage);
        return r.ok ? json({ ok: true, row: r.row }, { status: 201 }) : fail(r.error === 'FORBIDDEN' ? 403 : r.error === 'HANDOVER_OFF' ? 409 : 422, r.error);
      }
    }
    return fail(404, 'not-found');
  } catch (e) {
    return errorResponse(e);
  }
}
