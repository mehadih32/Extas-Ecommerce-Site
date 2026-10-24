// PR 549 — the gazetteer importer: a checked file (csv.ts) into GeoArea, installation-wide.
// - Safe to run any number of times: a place is found again by its code; only what changed is written, so a second run
//   with the same file changes nothing.
// - Nothing is deleted (hard rule 3): a place that is no longer in the file stays as it is, unless the run is asked to
//   archive what is missing (`archiveMissing`); a place that comes back in a later file is brought back.
// - Rows without a code (made some other way) are never touched.
// - PR 502: the owner's word wins. A place he renamed or re-spelled keeps his names; the file's spellings (and a new
//   file name) only join its spellings. A place he merged into another is never brought back, and the places the file
//   puts under it go under the place it was merged into. (The owner's changes are read from their audit rows.)
// - One audit row per run that changed something, with the counts (never the file itself).
// `ancestorIds` holds the chain above a place from the top down (division first), for subtree queries.
import { Prisma, type PrismaClient } from '@extas/db/client';
import { audit, SYSTEM, type Actor, type RequestContext } from '@extas/auth';
import { parentsFirst, type GazetteerRow } from './csv';
import { cleanAliases, OWNER_NAMED_ACTIONS, PLACE_ACTIONS } from './places-admin';

export interface ImportOptions {
  /** Where the list came from (`sample`, a file name); kept in the audit row, read back by `lastImportSource`. */
  source?: string;
  /** Archive coded places that are not in the file (default: leave them as they are). */
  archiveMissing?: boolean;
  /** Count what would change, write nothing. */
  dryRun?: boolean;
  actor?: Actor;
  ctx?: RequestContext;
  now?: () => Date;
}

export interface ImportReport {
  source: string | null;
  total: number;
  created: number;
  updated: number;
  restored: number;
  unchanged: number;
  archived: number;
  dryRun: boolean;
}

const SELECT = {
  id: true,
  code: true,
  level: true,
  parentId: true,
  ancestorIds: true,
  nameEn: true,
  nameBn: true,
  aliases: true,
  postcodes: true,
  cityCorporation: true,
  lat: true,
  lng: true,
  archivedAt: true,
} as const;

type Existing = Prisma.GeoAreaGetPayload<{ select: typeof SELECT }>;

const dec = (v: Prisma.Decimal | number | null): string | null => (v === null ? null : new Prisma.Decimal(v).toFixed(6));
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function data(r: GazetteerRow, parentId: string | null, ancestorIds: string[]) {
  return {
    code: r.code,
    level: r.level,
    parentId,
    ancestorIds,
    nameEn: r.nameEn,
    nameBn: r.nameBn,
    aliases: r.aliases,
    postcodes: r.postcodes,
    cityCorporation: r.cityCorporation,
    lat: r.lat === null ? null : new Prisma.Decimal(r.lat),
    lng: r.lng === null ? null : new Prisma.Decimal(r.lng),
  };
}

function differs(e: Existing, d: ReturnType<typeof data>): boolean {
  return (
    e.level !== d.level ||
    e.parentId !== d.parentId ||
    !same(e.ancestorIds, d.ancestorIds) ||
    e.nameEn !== d.nameEn ||
    e.nameBn !== d.nameBn ||
    !same(e.aliases, d.aliases) ||
    !same(e.postcodes, d.postcodes) ||
    e.cityCorporation !== d.cityCorporation ||
    dec(e.lat) !== dec(d.lat) ||
    dec(e.lng) !== dec(d.lng)
  );
}

/** The places whose names the owner set, and the places he merged (each with the place it went into). */
async function ownerChanges(tx: Prisma.TransactionClient): Promise<{ named: Set<string>; merged: Map<string, { id: string; ancestorIds: string[] }> }> {
  const rows = await tx.auditLog.findMany({ where: { entityType: 'GeoArea', action: { in: [...OWNER_NAMED_ACTIONS, PLACE_ACTIONS.merge] } }, select: { entityId: true, action: true, after: true }, orderBy: { createdAt: 'asc' } });
  const named = new Set<string>();
  const intoOf = new Map<string, string>();
  for (const r of rows) {
    if (!r.entityId) continue;
    if (r.action === PLACE_ACTIONS.merge) {
      const to = (r.after as { mergedIntoId?: unknown } | null)?.mergedIntoId;
      if (typeof to === 'string') intoOf.set(r.entityId, to);
    } else named.add(r.entityId);
  }
  // a chain of merges ends at the place that is still there
  const end = (id: string) => {
    const seen = new Set<string>();
    let at = id;
    while (intoOf.has(at) && !seen.has(at)) {
      seen.add(at);
      at = intoOf.get(at)!;
    }
    return at;
  };
  const targets = [...new Set([...intoOf.keys()].map(end))];
  const live = new Map((await tx.geoArea.findMany({ where: { id: { in: targets } }, select: { id: true, ancestorIds: true } })).map((t) => [t.id, t]));
  const merged = new Map<string, { id: string; ancestorIds: string[] }>();
  for (const id of intoOf.keys()) {
    const t = live.get(end(id));
    if (t) merged.set(id, { id: t.id, ancestorIds: t.ancestorIds });
  }
  return { named, merged };
}

/** Brings the gazetteer in line with the file. */
export async function importGazetteer(db: PrismaClient, rows: readonly GazetteerRow[], opts: ImportOptions = {}): Promise<ImportReport> {
  const now = opts.now ?? (() => new Date());
  const dryRun = opts.dryRun ?? false;
  const report: ImportReport = { source: opts.source ?? null, total: rows.length, created: 0, updated: 0, restored: 0, unchanged: 0, archived: 0, dryRun };
  const run = async (tx: Prisma.TransactionClient) => {
    const existing = new Map((await tx.geoArea.findMany({ where: { code: { not: null } }, select: SELECT })).map((e) => [e.code!, e]));
    const { named, merged } = await ownerChanges(tx);
    const idOf = new Map<string, string>();
    const chainOf = new Map<string, string[]>();
    let placeholder = 0;
    for (const tier of parentsFirst(rows)) {
      const fresh: ReturnType<typeof data>[] = [];
      for (const r of tier) {
        const parentId = r.parent ? idOf.get(r.parent)! : null;
        const ancestorIds = r.parent ? [...chainOf.get(r.parent)!, parentId!] : [];
        const d = data(r, parentId, ancestorIds);
        const e = existing.get(r.code);
        if (!e) {
          report.created++;
          fresh.push(d);
          continue;
        }
        const into = merged.get(e.id);
        if (into) {
          // merged by the owner: stays archived; what the file puts under it goes under the place it went into
          idOf.set(r.code, into.id);
          chainOf.set(r.code, into.ancestorIds);
          report.unchanged++;
          continue;
        }
        idOf.set(r.code, e.id);
        chainOf.set(r.code, ancestorIds);
        if (named.has(e.id)) {
          d.aliases = cleanAliases([...e.aliases, ...d.aliases, d.nameEn, ...(d.nameBn ? [d.nameBn] : [])], [e.nameEn, e.nameBn]);
          d.nameEn = e.nameEn;
          d.nameBn = e.nameBn;
        }
        const wasArchived = e.archivedAt !== null;
        if (!differs(e, d) && !wasArchived) {
          report.unchanged++;
          continue;
        }
        if (wasArchived) report.restored++;
        else report.updated++;
        if (!dryRun) await tx.geoArea.update({ where: { id: e.id }, data: { ...d, archivedAt: null } });
      }
      if (!fresh.length) continue;
      if (dryRun) {
        // Children of a place that does not exist yet still need a parent id to be counted.
        for (const d of fresh) {
          idOf.set(d.code, `dry-run-${placeholder++}`);
          chainOf.set(d.code, d.ancestorIds);
        }
        continue;
      }
      for (const made of await tx.geoArea.createManyAndReturn({ data: fresh, select: { id: true, code: true, ancestorIds: true } })) {
        idOf.set(made.code!, made.id);
        chainOf.set(made.code!, made.ancestorIds);
      }
    }
    if (opts.archiveMissing) {
      const inFile = new Set(rows.map((r) => r.code));
      const gone = [...existing.values()].filter((e) => !inFile.has(e.code!) && e.archivedAt === null).map((e) => e.id);
      report.archived = gone.length;
      if (gone.length && !dryRun) await tx.geoArea.updateMany({ where: { id: { in: gone } }, data: { archivedAt: now() } });
    }
    const changed = report.created + report.updated + report.restored + report.archived;
    if (changed && !dryRun) {
      await audit(tx, opts.actor ?? SYSTEM, { action: 'gazetteer.import', entityType: 'GeoArea', after: { ...report } }, { source: 'gazetteer-import', ...opts.ctx });
    }
  };
  await db.$transaction(run, { maxWait: 10_000, timeout: 300_000 });
  return report;
}

/** The source label of the last import that changed something, or null when nothing was ever imported. */
export async function lastImportSource(db: PrismaClient | Prisma.TransactionClient): Promise<string | null | undefined> {
  const row = await db.auditLog.findFirst({ where: { action: 'gazetteer.import', entityType: 'GeoArea' }, orderBy: { createdAt: 'desc' }, select: { after: true } });
  if (!row) return null;
  const after = row.after as { source?: unknown } | null;
  return typeof after?.source === 'string' ? after.source : undefined;
}

/** One line for a log: counts only. */
export function describeImport(r: ImportReport): string {
  const what = r.created + r.updated + r.restored + r.archived ? 'applied' : 'unchanged';
  return `gazetteer import: ${r.dryRun ? 'dry run, would be ' : ''}${what} — ${r.total} places in the file, ${r.created} new, ${r.updated} updated, ${r.restored} brought back, ${r.archived} archived, ${r.unchanged} unchanged`;
}
