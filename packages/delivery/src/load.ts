// PR 549 — the gazetteer from the database: every place that is not archived, as one shared in-memory index. The list
// changes only when the importer runs, so the index is kept for a while (`delivery.gazetteer.cacheSeconds`) and rebuilt
// when the number of places or their latest change moves. Reading it is one small query per check, not per address.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { Gazetteer, type GeoEntry } from './gazetteer';
import { readGazetteerCsv, type GazetteerRow } from './csv';

type Db = PrismaClient | Prisma.TransactionClient;

const holder = globalThis as unknown as { __extasGazetteer?: { at: number; stamp: string; gazetteer: Gazetteer } };

/** Every place that is not archived, straight from the database. */
export async function readGazetteer(db: Db): Promise<Gazetteer> {
  const rows = await db.geoArea.findMany({
    where: { archivedAt: null },
    select: { id: true, code: true, level: true, parentId: true, nameEn: true, nameBn: true, aliases: true, postcodes: true, cityCorporation: true },
    orderBy: [{ level: 'asc' }, { nameEn: 'asc' }, { id: 'asc' }],
  });
  return new Gazetteer(rows);
}

async function stampOf(db: Db): Promise<string> {
  const a = await db.geoArea.aggregate({ _count: { _all: true }, _max: { updatedAt: true } });
  return `${a._count._all}:${a._max.updatedAt?.getTime() ?? 0}`;
}

/** The shared index; rebuilt when the gazetteer changed, checked at most every `cacheSeconds`. */
export async function loadGazetteer(db: Db, opts: { cacheSeconds: number; now?: () => number }): Promise<Gazetteer> {
  const now = opts.now ?? Date.now;
  const held = holder.__extasGazetteer;
  if (held && now() - held.at < opts.cacheSeconds * 1000) return held.gazetteer;
  const stamp = await stampOf(db);
  if (held && held.stamp === stamp) {
    held.at = now();
    return held.gazetteer;
  }
  const gazetteer = await readGazetteer(db);
  holder.__extasGazetteer = { at: now(), stamp, gazetteer };
  return gazetteer;
}

/** Forget the shared index (tests; the importer's caller after an import). */
export function forgetGazetteer(): void {
  holder.__extasGazetteer = undefined;
}

/** A gazetteer straight from a file, ids = codes (the accuracy suite and the tests run on the sample this way). */
export function gazetteerFromRows(rows: readonly GazetteerRow[]): Gazetteer {
  const entries: GeoEntry[] = rows.map((r) => ({
    id: r.code,
    code: r.code,
    level: r.level,
    parentId: r.parent,
    nameEn: r.nameEn,
    nameBn: r.nameBn,
    aliases: r.aliases,
    postcodes: r.postcodes,
    cityCorporation: r.cityCorporation,
  }));
  return new Gazetteer(entries);
}

export const gazetteerFromCsv = (text: string): Gazetteer => gazetteerFromRows(readGazetteerCsv(text));
