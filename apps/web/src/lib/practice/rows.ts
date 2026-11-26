// S28 · PR 1220 (p102, the owner's ask: the row buttons the prototype v5 shows appear on the live admin while practice mode is
// on) — the practice world's NON-money display rows beside the flagged orders and customers: the AI approvals waiting (AI ›
// Approvals), written from the prototype's own queue (data.ts `PRACTICE_ROWS`). Rules, the same as the rest of the practice
// world:
//  - Practice-owned by a mark, never a real row: an approval carries `channel = 'practice'` (PRACTICE_CHANNEL). The table has
//    no practice flag and the schema is not changed here.
//  - Shown only while practice mode is on: every list that reads them filters the mark out while it is off
//    (`practiceApprovalScope`), and nothing that sends or acts (the Telegram digest, the AI) ever reads them.
//  - Acting on one never acts for real: an approval of these kinds is decided by a status change only (approvals.ts has no
//    side effect for them), nothing is sent, booked, published or moved.
//  - Removed by "Reset practice data" and the sales rebuild (`removePracticeRows`, reset.ts); a second seed adds nothing.
//  - Deterministic: ids come from the row's own key, times are counted back from `now`.
import { isPracticeStaffEmail, PRACTICE_STAFF_DOMAIN } from '@extas/auth';
import type { Prisma, PrismaClient } from '@extas/db/client';
import { GROWTH_AGENT, GROWTH_KIND } from '../marketing/growth-kind';
import { PRACTICE_ROWS, type PracticeApproval } from './data';
import { practiceId } from './ids';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;
const MINUTE = 60_000; // hardcode-ok: milliseconds in a minute

/** The mark on every practice approval (AiApprovalRequest.channel). */
export const PRACTICE_CHANNEL = 'practice'; // hardcode-ok: an ownership mark, not a text the shop shows

/** The `where` that leaves practice approvals out (a null channel is kept: `channel <> x` alone would drop it). */
export const NOT_PRACTICE_APPROVAL: Prisma.AiApprovalRequestWhereInput = { OR: [{ channel: null }, { channel: { not: PRACTICE_CHANNEL } }] };

/** The extra `where` of an approvals list: nothing while practice mode is on, else "not a practice approval". */
export function practiceApprovalScope(practiceOn: boolean): Prisma.AiApprovalRequestWhereInput {
  return practiceOn ? {} : NOT_PRACTICE_APPROVAL;
}

/**
 * PR 1221: the AI › Approvals queue's scope. As `practiceApprovalScope`, and the practice growth proposals stay on Marketing ›
 * Plan only (the prototype's queue does not list them; a real growth proposal still shows in both, as before).
 */
export function practiceQueueScope(practiceOn: boolean): Prisma.AiApprovalRequestWhereInput {
  return practiceOn ? { OR: [NOT_PRACTICE_APPROVAL, { kind: { not: GROWTH_KIND } }] } : NOT_PRACTICE_APPROVAL;
}

/** An amount of a sample text in the store's currency, whole units (৳1,500). */
function moneyText(currency: string, n: number): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(n) ? 0 : 1 }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

/** Fills `{m0}`… with the amounts and `{name}`… with the values; an unknown placeholder is left as it is. */
export function fillText(text: string, currency: string, money: readonly number[] = [], values: Record<string, string | number> = {}): string {
  return text.replace(/\{(m\d+|[a-zA-Z]+)\}/g, (all, k: string) => {
    if (/^m\d+$/.test(k)) {
      const n = money[Number(k.slice(1))];
      return n === undefined ? all : moneyText(currency, n);
    }
    return values[k] === undefined ? all : String(values[k]);
  });
}

const districtOf = (address: string | null): string => (address ?? '').split(',').map((s) => s.trim()).filter(Boolean).pop() ?? '';

/** The prototype's approvals waiting (and one decided), once per store. Cards about an order or a customer use practice ones. */
async function seedApprovals(db: Db, storeId: number, currency: string, now: Date): Promise<number> {
  if ((await db.aiApprovalRequest.count({ where: { storeId, channel: PRACTICE_CHANNEL, kind: { not: GROWTH_KIND } } })) > 0) return 0;
  const [orders, refuser, anyone, product] = await Promise.all([
    db.order.findMany({ where: { storeId, isPractice: true, status: 'PLACED', archivedAt: null }, orderBy: [{ placedAt: 'desc' }, { id: 'asc' }], take: 2, select: { id: true, number: true, customerName: true, shippingAddressText: true } }),
    db.customer.findFirst({ where: { storeId, isPractice: true, returnedCount: { gt: 0 } }, orderBy: [{ returnedCount: 'desc' }, { id: 'asc' }], select: { id: true, name: true, orderCount: true, returnedCount: true } }),
    db.customer.findFirst({ where: { storeId, isPractice: true }, orderBy: { id: 'asc' }, select: { id: true, name: true } }),
    db.product.findFirst({ where: { storeId, isPractice: true, archivedAt: null }, orderBy: [{ sortRank: 'asc' }, { id: 'asc' }], select: { id: true, nameEn: true, minPriceMinor: true } }),
  ]);
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const rows: Prisma.AiApprovalRequestCreateManyInput[] = [];
  let orderNo = 0;
  for (const a of PRACTICE_ROWS.approvals as PracticeApproval[]) {
    const values: Record<string, string | number> = {};
    let refType: string | null = null;
    let refId: string | null = null;
    if (a.uses === 'order') {
      const o = orders[orderNo++];
      if (!o) continue; // no waiting practice order: the card is left out rather than made about nothing
      Object.assign(values, { order: o.number, name: o.customerName ?? '', district: districtOf(o.shippingAddressText), orderId: o.id });
      refType = 'Order';
      refId = o.id;
    } else if (a.uses === 'refuser') {
      if (!refuser) continue;
      Object.assign(values, { name: refuser.name ?? '', refused: refuser.returnedCount, orders: refuser.orderCount, customerId: refuser.id });
      refType = 'Customer';
      refId = refuser.id;
    } else if (a.uses === 'customer') {
      if (!anyone) continue;
      values.name = anyone.name ?? '';
    } else if (a.uses === 'product') {
      if (!product) continue;
      const each = product.minPriceMinor / 10 ** digits;
      Object.assign(values, { product: product.nameEn, combo: moneyText(currency, Math.round((each * 2 * 0.9) / 10) * 10) }); // hardcode-ok: the prototype's sample combo (two pieces, 10% off, to the nearest 10)
    }
    const at = new Date(now.getTime() - a.minutesAgo * MINUTE);
    const decided = a.decidedMinutesAgo !== undefined ? new Date(now.getTime() - a.decidedMinutesAgo * MINUTE) : null;
    const ownerView: Record<string, string> = { impact: fillText(a.impact, currency, a.money, values), openHref: fillText(a.open, currency, [], values) };
    if (a.draft) ownerView.draft = fillText(a.draft, currency, a.money, values);
    rows.push({
      id: practiceId(`approval:${storeId}:${a.key}`),
      storeId,
      agentKey: a.agent,
      kind: a.kind,
      title: fillText(a.title, currency, a.money, values),
      summary: fillText(a.why, currency, a.money, values),
      payload: { practice: true, ownerView } as Prisma.InputJsonValue,
      status: decided ? 'APPROVED' : 'PENDING',
      channel: PRACTICE_CHANNEL,
      refType,
      refId,
      decidedAt: decided,
      decisionNote: decided ? 'Practice' : null,
      createdAt: at,
      updatedAt: decided ?? at,
    });
  }
  return (await db.aiApprovalRequest.createMany({ data: rows, skipDuplicates: true })).count;
}

/**
 * PR 1221 — Marketing › Plan: the prototype's AI proposals as the growth agent's own rows (its kind, agent and payload), so the
 * plan page shows them with its own words and its Approve / No. Deciding one never reaches an ad account (growth-agent.ts
 * `decidePracticeProposal`). The campaign they name is a practice name only, never a real campaign.
 */
async function seedProposals(db: Db, storeId: number, currency: string, now: Date): Promise<number> {
  if ((await db.aiApprovalRequest.count({ where: { storeId, channel: PRACTICE_CHANNEL, kind: GROWTH_KIND } })) > 0) return 0;
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const minor = (n: number) => Math.round(n * 10 ** digits);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const from = day(new Date(now.getTime() - 14 * 1440 * MINUTE)); // hardcode-ok: the prototype's two sample weeks
  const rows: Prisma.AiApprovalRequestCreateManyInput[] = PRACTICE_ROWS.proposals.map((p) => {
    const refId = practiceId(`proposal-ref:${storeId}:${p.key}`);
    const at = new Date(now.getTime() - p.minutesAgo * MINUTE);
    const payload = {
      type: p.type,
      refType: 'AdCampaign',
      refId,
      spendMinor: minor(p.spend),
      delivered: p.delivered,
      deliveredSalesMinor: minor(p.sales),
      roasPercent: p.roas,
      beforeRoasPercent: null,
      fromDailyMinor: p.fromDaily === null ? null : minor(p.fromDaily),
      toDailyMinor: p.toDaily === null ? null : minor(p.toDaily),
      from,
      to: day(now),
      currency,
      practiceName: p.name,
      practice: true,
    };
    return { id: practiceId(`proposal:${storeId}:${p.key}`), storeId, agentKey: GROWTH_AGENT, kind: GROWTH_KIND, title: p.name, payload: payload as Prisma.InputJsonValue, status: 'PENDING', channel: PRACTICE_CHANNEL, refType: 'AdCampaign', refId, createdAt: at, updatedAt: at };
  });
  return (await db.aiApprovalRequest.createMany({ data: rows, skipDuplicates: true })).count;
}

/** Writes the practice display rows that are not there yet. Idempotent; touches nothing outside the practice world. */
export async function seedPracticeRows(db: Db, storeId: number, now: Date = new Date()): Promise<Record<string, number>> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { currency: true } });
  if (!store) return {};
  return {
    practiceApprovals: await seedApprovals(db, storeId, store.currency, now),
    practiceProposals: await seedProposals(db, storeId, store.currency, now),
    ...(await seedStaff(db, storeId, now)),
  };
}

// ---- PR 1222: the practice staff and their roles (Settings › Team & roles, Settings › Activity) ----------------------------
// Staff and roles belong to the whole installation, so they are practice-owned by their mark: the e-mail on the reserved
// domain `practice.invalid` (@extas/auth refuses every sign-in of such an account) and the role key `practice-…`. The roles
// hold read-only permissions only. While practice mode is off both are archived (hidden from every list and picker); "on"
// brings them back. Nothing is ever sent to them: the address cannot receive mail and they have no phone, push or Telegram.

/** The role key prefix of the practice roles. */
export const PRACTICE_ROLE_PREFIX = 'practice-'; // hardcode-ok: an ownership prefix, not a text the shop shows
/** A practice account's password field: not a password hash, so no password can ever match it (the sign-in refuses first anyway). */
const NO_SIGN_IN = 'practice:no-sign-in'; // hardcode-ok: a marker, never a secret

export const practiceStaffWhere: Prisma.StaffUserWhereInput = { email: { endsWith: `@${PRACTICE_STAFF_DOMAIN}` } };
const practiceRoleWhere: Prisma.RoleWhereInput = { key: { startsWith: PRACTICE_ROLE_PREFIX } };

async function seedStaff(db: Db, storeId: number, now: Date): Promise<{ practiceStaff: number; practiceRoles: number }> {
  const out = { practiceStaff: 0, practiceRoles: 0 };
  const perms = new Map((await db.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]));
  const roleIds = new Map<string, string>();
  for (const r of PRACTICE_ROWS.roles) {
    const key = `${PRACTICE_ROLE_PREFIX}${r.key}`;
    const had = await db.role.findUnique({ where: { key }, select: { id: true } });
    if (had) {
      roleIds.set(r.key, had.id);
      continue;
    }
    const role = await db.role.create({ data: { key, nameEn: r.nameEn, nameBn: r.nameBn, isSystem: false }, select: { id: true } });
    // only read keys, and only those the installation knows
    const ids = r.permissions.filter((k) => k.endsWith('.read')).map((k) => perms.get(k)).filter((x): x is string => !!x);
    if (ids.length) await db.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });
    roleIds.set(r.key, role.id);
    out.practiceRoles += 1;
  }
  for (const s of PRACTICE_ROWS.staff) {
    const email = `${s.key}@${PRACTICE_STAFF_DOMAIN}`;
    if (await db.staffUser.findUnique({ where: { email }, select: { id: true } })) continue;
    const last = new Date(now.getTime() - s.lastMinutesAgo * MINUTE);
    const staff = await db.staffUser.create({
      data: { id: practiceId(`staff:${s.key}`), email, displayName: s.name, passwordHash: NO_SIGN_IN, passwordSetAt: last, twoFactorEnabled: s.twoFactor, status: 'ACTIVE', lastLoginAt: last },
      select: { id: true },
    });
    const roleId = roleIds.get(s.role);
    if (roleId) await db.staffRoleAssignment.createMany({ data: [{ staffUserId: staff.id, roleId, storeId }], skipDuplicates: true });
    out.practiceStaff += 1;
  }
  return out;
}

/** How many practice staff or roles are not in the state practice mode asks for (0 = nothing to do). */
export async function practiceRowsDrift(db: Db, on: boolean): Promise<number> {
  const [staff, roles] = await Promise.all([
    db.staffUser.count({ where: { ...practiceStaffWhere, status: on ? 'ARCHIVED' : { not: 'ARCHIVED' } } }),
    db.role.count({ where: { ...practiceRoleWhere, archivedAt: on ? { not: null } : null } }),
  ]);
  return staff + roles;
}

/** Brings the practice staff and roles to the state of the switch: archived while off, active while on. Ends any session. */
export async function syncPracticeRows(db: Db, on: boolean, now: Date = new Date()): Promise<void> {
  if (on) {
    await db.staffUser.updateMany({ where: { ...practiceStaffWhere, status: 'ARCHIVED' }, data: { status: 'ACTIVE', archivedAt: null } });
    await db.role.updateMany({ where: { ...practiceRoleWhere, archivedAt: { not: null } }, data: { archivedAt: null } });
    return;
  }
  await db.staffUser.updateMany({ where: { ...practiceStaffWhere, status: { not: 'ARCHIVED' } }, data: { status: 'ARCHIVED', archivedAt: now } });
  await db.role.updateMany({ where: { ...practiceRoleWhere, archivedAt: null }, data: { archivedAt: now } });
  await db.staffSession.updateMany({ where: { revokedAt: null, staffUser: practiceStaffWhere }, data: { revokedAt: now } });
}

/** A practice staff account kept out of view (practice mode off): lists leave it out. */
export const isHiddenPracticeStaff = (s: { email: string; status: string }) => isPracticeStaffEmail(s.email) && s.status === 'ARCHIVED';

/** Are practice display rows missing on a store that holds the practice world (cheap counts)? */
export async function practiceRowsMissing(db: Db, storeId: number): Promise<boolean> {
  const [orders, approvals, proposals, staff] = await Promise.all([
    db.order.count({ where: { storeId, isPractice: true } }),
    db.aiApprovalRequest.count({ where: { storeId, channel: PRACTICE_CHANNEL, kind: { not: GROWTH_KIND } } }),
    db.aiApprovalRequest.count({ where: { storeId, channel: PRACTICE_CHANNEL, kind: GROWTH_KIND } }),
    db.staffUser.count({ where: practiceStaffWhere }),
  ]);
  return orders > 0 && (approvals === 0 || proposals === 0 || staff === 0);
}

/**
 * Removes the practice staff and roles (inside "Reset practice data"'s transaction). A practice account or role that another
 * record still points at (a task given to it, a real person holding the role) is archived instead of removed, so nothing
 * real loses a link; the rest goes with its sessions, role links and permissions.
 */
export async function removePracticeStaff(tx: Tx): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const staff = (await tx.staffUser.findMany({ where: practiceStaffWhere, select: { id: true } })).map((s) => s.id);
  const roles = (await tx.role.findMany({ where: practiceRoleWhere, select: { id: true } })).map((r) => r.id);
  if (!staff.length && !roles.length) return out;
  const own = new Set(['StaffSession', 'StaffRoleAssignment', 'StaffPushSubscription', 'RolePermission']);
  const fks = await tx.$queryRaw<{ child: string; col: string; parent: string }[]>`
    SELECT cl.relname AS child, ca.attname AS col, pl.relname AS parent
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
      JOIN pg_class pl ON pl.oid = c.confrelid
      JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND pl.relname IN ('StaffUser', 'Role')`;
  const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
  const used = async (parent: string, ids: string[]): Promise<Set<string>> => {
    const busy = new Set<string>();
    for (const fk of fks.filter((f) => f.parent === parent && !own.has(f.child))) {
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT DISTINCT ${q(fk.col)}::text AS id FROM ${q(fk.child)} WHERE ${q(fk.col)}::text = ANY($1::text[])`, ids);
      for (const r of rows) busy.add(r.id);
    }
    return busy;
  };
  // a practice role a real person holds stays (archived): that person's access is not changed by a reset
  const realHolders = new Set((await tx.staffRoleAssignment.findMany({ where: { roleId: { in: roles }, revokedAt: null, staffUser: { NOT: practiceStaffWhere } }, select: { roleId: true } })).map((a) => a.roleId));
  const busyStaff = staff.length ? await used('StaffUser', staff) : new Set<string>();
  const goStaff = staff.filter((id) => !busyStaff.has(id));
  if (goStaff.length) {
    await tx.staffSession.deleteMany({ where: { staffUserId: { in: goStaff } } });
    await tx.staffPushSubscription.deleteMany({ where: { staffUserId: { in: goStaff } } });
    await tx.staffRoleAssignment.deleteMany({ where: { staffUserId: { in: goStaff } } });
    out.StaffUser = (await tx.staffUser.deleteMany({ where: { id: { in: goStaff } } })).count;
  }
  if (busyStaff.size) await tx.staffUser.updateMany({ where: { id: { in: [...busyStaff] } }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
  const busyRoles = roles.length ? await used('Role', roles) : new Set<string>();
  const goRoles = roles.filter((id) => !busyRoles.has(id) && !realHolders.has(id));
  if (goRoles.length) {
    await tx.staffRoleAssignment.deleteMany({ where: { roleId: { in: goRoles } } });
    await tx.rolePermission.deleteMany({ where: { roleId: { in: goRoles } } });
    out.Role = (await tx.role.deleteMany({ where: { id: { in: goRoles } } })).count;
  }
  const keep = roles.filter((id) => !goRoles.includes(id));
  if (keep.length) await tx.role.updateMany({ where: { id: { in: keep } }, data: { archivedAt: new Date() } });
  return out;
}

/** Removes the practice display rows (inside the reset's transaction). Returns what it removed, by table. */
export async function removePracticeRows(tx: Tx, storeId: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const n = (await tx.aiApprovalRequest.deleteMany({ where: { storeId, channel: PRACTICE_CHANNEL } })).count;
  if (n) out.AiApprovalRequest = n;
  return out;
}
