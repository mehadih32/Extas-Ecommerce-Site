// S23 · PR 437 (Blueprint C5.4 "all of its switches … appear inside the studio") — the studio's social accounts
// (SocialAccount): one row per platform page/channel the owner connects. Adding one here names the page/channel's
// own id and switches nothing on; the platform's publishing adapter (PR 440, 441) is a separate step on Keys &
// connections, and even once it is entered and tested, a row here stays off (`enabled: false`) until a person
// switches it on. `requireApproval` ships `true` on every new account (CLAUDE.md rule 6: nothing is published
// without the owner's written OK by default); only an account the owner has explicitly set to run free skips the
// approval queue (PR 442), and even then every post still goes out on the platform's MOCK adapter until a real key
// is entered and its Test passes (A1.3) — so nothing reaches a real account from this PR.
// Nothing here is ever deleted: "archive" and "restore" only.
import { z } from 'zod';
import { allow, checkStoreId, holds, logChange, nowOf, parse, StudioError, type StudioDeps, type Who } from './context';

/** The platforms the studio knows (Blueprint C5.1). Each is at most one row per `externalId` in a store. */
export const STUDIO_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube'] as const;
export type StudioPlatform = (typeof STUDIO_PLATFORMS)[number];

const idOf = z.string().trim().min(1).max(80);
const nameOf = z.string().trim().min(1).max(80);

export const addAccountInput = z
  .object({
    platform: z.enum(STUDIO_PLATFORMS),
    externalId: idOf,
    name: nameOf,
  })
  .strict();

export const saveAccountInput = z.discriminatedUnion('action', [
  addAccountInput.extend({ action: z.literal('add') }),
  z.object({ action: z.literal('rename'), id: z.uuid(), name: nameOf, version: z.string().max(40).optional() }).strict(),
  z.object({ action: z.literal('switch'), id: z.uuid(), enabled: z.boolean(), version: z.string().max(40).optional() }).strict(),
  // `requireApproval` is never turned off from here on its own: PR 442's queue page asks for it with a confirm, next
  // to the words "every post from this account goes out with no one looking at it first".
  z.object({ action: z.literal('requireApproval'), id: z.uuid(), requireApproval: z.boolean(), version: z.string().max(40).optional() }).strict(),
  z.object({ action: z.literal('dailyLimit'), id: z.uuid(), dailyLimit: z.number().int().min(1).max(500).nullable(), version: z.string().max(40).optional() }).strict(),
  // S23 · PR 441 — TikTok only (Blueprint C5.1: "direct posting switched on when approved"); this is the owner
  // saying the app audit approval has arrived, not a key, so it stays a plain write like `requireApproval`. On any
  // other platform it means nothing: refused (`INVALID_INPUT`), not silently ignored.
  z.object({ action: z.literal('directPostApproved'), id: z.uuid(), directPostApproved: z.boolean(), version: z.string().max(40).optional() }).strict(),
  z.object({ action: z.literal('archive'), id: z.uuid(), archived: z.boolean(), version: z.string().max(40).optional() }).strict(),
]);

export interface StudioAccountRow {
  id: string;
  platform: StudioPlatform;
  externalId: string;
  name: string;
  requireApproval: boolean;
  directPostApproved: boolean;
  dailyLimit: number | null;
  enabled: boolean;
  archived: boolean;
  version: string;
}

const rowOf = (a: { id: string; platform: string; externalId: string; name: string; requireApproval: boolean; directPostApproved: boolean; dailyLimit: number | null; enabled: boolean; archivedAt: Date | null; updatedAt: Date }): StudioAccountRow => ({
  id: a.id,
  platform: a.platform as StudioPlatform,
  externalId: a.externalId,
  name: a.name,
  requireApproval: a.requireApproval,
  directPostApproved: a.directPostApproved,
  dailyLimit: a.dailyLimit,
  enabled: a.enabled,
  archived: a.archivedAt !== null,
  version: a.updatedAt.toISOString(),
});

/** The store's social accounts (`studio.read`), switched on first, then by platform and name. */
export async function studioAccounts(deps: StudioDeps, who: Who): Promise<{ rows: StudioAccountRow[]; canWrite: boolean }> {
  await allow(deps, who, 'studio.read');
  const rows = await deps.db.socialAccount.findMany({
    where: { storeId: who.storeId },
    orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { enabled: 'desc' }, { platform: 'asc' }, { name: 'asc' }],
  });
  return { rows: rows.map(rowOf), canWrite: await holds(deps, who, 'studio.write') };
}

/** Adds, renames, switches, sets the approval/daily-limit or archives/restores an account (`studio.write`). Audited. */
export async function saveStudioAccount(deps: StudioDeps, who: Who, input: unknown): Promise<StudioAccountRow> {
  await allow(deps, who, 'studio.write');
  checkStoreId(who.storeId);
  const d = parse(saveAccountInput, input, 'account');
  if (d.action === 'add') {
    const had = await deps.db.socialAccount.findUnique({ where: { storeId_platform_externalId: { storeId: who.storeId, platform: d.platform, externalId: d.externalId } } });
    if (had) throw new StudioError('ALREADY_ADDED', 'this account is added already', ['externalId']);
    // added off and needing approval: a person switches it on, and only an explicit later choice lets it run free
    const made = await deps.db.socialAccount.create({ data: { storeId: who.storeId, platform: d.platform, externalId: d.externalId, name: d.name, requireApproval: true, directPostApproved: false, enabled: false } });
    await logChange(deps.db, who, { action: 'studio.account.add', entityType: 'SocialAccount', entityId: made.id, before: null, after: { platform: d.platform, externalId: d.externalId, name: d.name } });
    return rowOf(made);
  }
  const c = await deps.db.socialAccount.findFirst({ where: { id: d.id, storeId: who.storeId } });
  if (!c) throw new StudioError('NOT_FOUND', 'no such account', ['id']);
  if (d.version !== undefined && d.version !== c.updatedAt.toISOString()) throw new StudioError('STALE', 'the account changed; read it again', ['version']);
  if (d.action === 'directPostApproved' && c.platform !== 'tiktok') throw new StudioError('INVALID_INPUT', 'only a TikTok account has direct-post approval', ['id']);
  const before = rowOf(c);
  const data =
    d.action === 'rename'
      ? { name: d.name }
      : d.action === 'switch'
        ? { enabled: d.enabled }
        : d.action === 'requireApproval'
          ? { requireApproval: d.requireApproval }
          : d.action === 'directPostApproved'
            ? { directPostApproved: d.directPostApproved }
            : d.action === 'dailyLimit'
              ? { dailyLimit: d.dailyLimit }
              : { archivedAt: d.archived ? (c.archivedAt ?? nowOf(deps)) : null, ...(d.archived ? { enabled: false } : {}) };
  const after = await deps.db.socialAccount.update({ where: { id: c.id }, data });
  await logChange(deps.db, who, { action: `studio.account.${d.action}`, entityType: 'SocialAccount', entityId: c.id, before, after: rowOf(after) });
  return rowOf(after);
}
