// PR 16, 495 — the auth sync, run by every deploy after the settings sync (the `migrate` image):
// - every catalogue permission gets its Permission row; labels follow messages/auth.<lang>.json;
// - the owner role exists (key `owner`, system role) and holds every catalogue permission;
// - permissions that left the catalogue keep their rows (nothing is deleted) and are reported.
// Nothing else: other roles are the admin's (role builder). Running it again changes nothing. Two syncs never
// interleave (advisory lock).
import type { PrismaClient } from '@extas/db/client';
import { audit, SYSTEM } from './audit';
import { OWNER_ROLE_KEY, PERMISSION_KEYS, PERMISSIONS, permissionLabelKey } from './catalogue';
import { authLabel } from './messages';

export interface AuthSyncReport {
  status: 'applied' | 'unchanged';
  permissionsAdded: string[];
  permissionsChanged: string[];
  /** Rows whose key is no longer in the catalogue (kept; they grant nothing). */
  permissionsRetired: string[];
  ownerRoleCreated: boolean;
  ownerGranted: string[];
}

// Any constant both syncs agree on; keeps two deploys from running the sync at the same moment.
const LOCK_KEY = 4_915_016;

export async function syncAuth(db: PrismaClient): Promise<AuthSyncReport> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
      const report: AuthSyncReport = { status: 'unchanged', permissionsAdded: [], permissionsChanged: [], permissionsRetired: [], ownerRoleCreated: false, ownerGranted: [] };

      const rows = await tx.permission.findMany();
      const byKey = new Map(rows.map((r) => [r.key, r]));
      for (const key of PERMISSION_KEYS) {
        const label = authLabel(permissionLabelKey(key));
        const want = { group: PERMISSIONS[key].group, labelEn: label.en, labelBn: label.bn };
        const row = byKey.get(key);
        if (!row) {
          await tx.permission.create({ data: { key, ...want } });
          report.permissionsAdded.push(key);
        } else if (row.group !== want.group || row.labelEn !== want.labelEn || row.labelBn !== want.labelBn) {
          await tx.permission.update({ where: { key }, data: want });
          report.permissionsChanged.push(key);
        }
      }
      const known = new Set<string>(PERMISSION_KEYS);
      report.permissionsRetired = rows.map((r) => r.key).filter((k) => !known.has(k)).sort();

      const ownerName = authLabel('roles.owner.name');
      const ownerDesc = authLabel('roles.owner.description');
      let owner = await tx.role.findUnique({ where: { key: OWNER_ROLE_KEY } });
      if (!owner) {
        owner = await tx.role.create({
          data: { key: OWNER_ROLE_KEY, nameEn: ownerName.en, nameBn: ownerName.bn, descriptionEn: ownerDesc.en, descriptionBn: ownerDesc.bn, isSystem: true },
        });
        report.ownerRoleCreated = true;
        await audit(tx, SYSTEM, { action: 'role.create', entityType: 'Role', entityId: owner.id, after: { key: OWNER_ROLE_KEY, system: true } }, { source: 'auth-sync' });
      } else if (!owner.isSystem || owner.archivedAt) {
        // The owner role is never archived and always a system role.
        await tx.role.update({ where: { id: owner.id }, data: { isSystem: true, archivedAt: null } });
      }
      // Names: the seeded labels are written once; the owner may rename the role afterwards.

      const perms = await tx.permission.findMany({ where: { key: { in: PERMISSION_KEYS } }, select: { id: true, key: true } });
      const granted = new Set((await tx.rolePermission.findMany({ where: { roleId: owner.id }, select: { permissionId: true } })).map((r) => r.permissionId));
      const missing = perms.filter((p) => !granted.has(p.id));
      if (missing.length) {
        await tx.rolePermission.createMany({ data: missing.map((p) => ({ roleId: owner.id, permissionId: p.id })), skipDuplicates: true });
        report.ownerGranted = missing.map((p) => p.key).sort();
      }

      if (report.permissionsAdded.length || report.permissionsChanged.length || report.ownerRoleCreated || report.ownerGranted.length) {
        report.status = 'applied';
      }
      return report;
    },
    { timeout: 30_000 },
  );
}

export function describeAuthSync(r: AuthSyncReport): string[] {
  const lines = [`auth sync: ${r.status} — ${PERMISSION_KEYS.length} permissions in the catalogue`];
  if (r.permissionsAdded.length) lines.push(`  added: ${r.permissionsAdded.join(', ')}`);
  if (r.permissionsChanged.length) lines.push(`  labels changed: ${r.permissionsChanged.join(', ')}`);
  if (r.permissionsRetired.length) lines.push(`  no longer in the catalogue (kept, grant nothing): ${r.permissionsRetired.join(', ')}`);
  if (r.ownerRoleCreated) lines.push('  owner role created');
  if (r.ownerGranted.length) lines.push(`  owner role granted: ${r.ownerGranted.join(', ')}`);
  return lines;
}
