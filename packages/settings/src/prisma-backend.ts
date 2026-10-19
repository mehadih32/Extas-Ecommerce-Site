// PostgreSQL backend of the resolver, on the schema's settings tables (PR 13): InstallationSettingValue (tier 1),
// StoreSettingValue (tier 2) and the append-only SettingChange log. Works through PgBouncer in transaction mode (the
// app's DATABASE_URL): every write is one short interactive transaction, and nothing needs LISTEN.
import { Prisma, type PrismaClient } from '@extas/db/client';
import type { SettingValueTypeName } from './define';
import {
  sameJson,
  type ChangeResult,
  type ClearRequest,
  type SettingsBackend,
  type Snapshot,
  type WriteRequest,
} from './backend';
import { SettingsError } from './errors';
import type { StoredValue } from './resolve';

// The registry's value-type names must stay identical to the schema enum (compile-time check, both directions).
type SchemaValueType = Prisma.SettingDefinitionCreateInput['valueType'];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const VALUE_TYPES_MATCH_SCHEMA: Same<SchemaValueType, SettingValueTypeName> = true;

/** A JSON value for a non-null Json column (JSON null becomes the JSON literal `null`). */
export function jsonValue(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue);
}

/** A JSON value for a nullable Json column, where "no value" is SQL NULL. */
export function jsonOrDbNull(v: unknown, present: boolean): Prisma.InputJsonValue | typeof Prisma.JsonNull | typeof Prisma.DbNull {
  return present ? jsonValue(v) : Prisma.DbNull;
}

type Tx = Prisma.TransactionClient;

export function prismaBackend(prisma: PrismaClient): SettingsBackend {
  const findRow = (tx: Tx, key: string, storeId: number | null) =>
    storeId === null
      ? tx.installationSettingValue.findUnique({ where: { key } })
      : tx.storeSettingValue.findUnique({ where: { storeId_key: { storeId, key } } });

  const preflight = async (tx: Tx, key: string, storeId: number | null) => {
    const def = await tx.settingDefinition.findUnique({ where: { key }, select: { key: true } });
    if (!def) throw new SettingsError('NOT_SYNCED', key, 'no SettingDefinition row — run the settings sync');
    if (storeId !== null) {
      const store = await tx.store.findUnique({ where: { id: storeId }, select: { id: true } });
      if (!store) throw new SettingsError('UNKNOWN_STORE', key, `store ${storeId} does not exist`);
    }
  };

  const lock = (key: string, version: number | undefined, expected: number | undefined) => {
    if (expected !== undefined && (version ?? 0) !== expected) {
      throw new SettingsError('VERSION_CONFLICT', key, `expected version ${expected}, found ${version ?? 0}`);
    }
  };

  const conflictOnRace = async <T>(key: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new SettingsError('VERSION_CONFLICT', key, 'saved by someone else at the same moment');
      }
      throw error;
    }
  };

  return {
    async version() {
      return String(await prisma.settingChange.count());
    },

    async load(): Promise<Snapshot> {
      const version = String(await prisma.settingChange.count());
      const [inst, store] = await Promise.all([
        prisma.installationSettingValue.findMany({ select: { key: true, value: true, version: true } }),
        prisma.storeSettingValue.findMany({ select: { storeId: true, key: true, value: true, version: true } }),
      ]);
      const installation = new Map<string, StoredValue>(inst.map((r) => [r.key, { value: r.value, version: r.version }]));
      const stores = new Map<number, Map<string, StoredValue>>();
      for (const r of store) {
        let m = stores.get(r.storeId);
        if (!m) stores.set(r.storeId, (m = new Map()));
        m.set(r.key, { value: r.value, version: r.version });
      }
      return { version, installation, stores };
    },

    async write(req: WriteRequest): Promise<ChangeResult> {
      const { key } = req;
      const storeId = req.target.level === 'store' ? req.target.storeId : null;
      const actorId = req.actorId ?? null;
      return conflictOnRace(key, () =>
        prisma.$transaction(async (tx) => {
          await preflight(tx, key, storeId);
          const row = await findRow(tx, key, storeId);
          lock(key, row?.version, req.expectedVersion);
          if (row && sameJson(row.value, req.value)) {
            return { changed: false, oldValue: row.value, newValue: row.value, version: row.version };
          }
          const version = (row?.version ?? 0) + 1;
          const value = jsonValue(req.value);
          if (row) {
            const data = { value, version, updatedById: actorId };
            const where = { id: row.id, version: row.version };
            const n =
              storeId === null
                ? await tx.installationSettingValue.updateMany({ where, data })
                : await tx.storeSettingValue.updateMany({ where, data });
            if (n.count !== 1) throw new SettingsError('VERSION_CONFLICT', key, 'saved by someone else meanwhile');
          } else if (storeId === null) {
            await tx.installationSettingValue.create({ data: { key, value, updatedById: actorId } });
          } else {
            await tx.storeSettingValue.create({ data: { storeId, key, value, updatedById: actorId } });
          }
          await tx.settingChange.create({
            data: {
              storeId,
              key,
              action: 'SET',
              oldValue: jsonOrDbNull(row?.value, Boolean(row)),
              newValue: value,
              reason: req.reason ?? null,
              actorId,
            },
          });
          return { changed: true, oldValue: row?.value, newValue: req.value, version };
        }),
      );
    },

    async clear(req: ClearRequest): Promise<ChangeResult> {
      const { key } = req;
      const storeId = req.target.level === 'store' ? req.target.storeId : null;
      return prisma.$transaction(async (tx) => {
        await preflight(tx, key, storeId);
        const row = await findRow(tx, key, storeId);
        lock(key, row?.version, req.expectedVersion);
        if (!row) return { changed: false, version: 0 };
        // Removing the override row is what "inherit" means (missing row = next tier answers). The old value is
        // kept in the SettingChange log, so nothing is lost.
        const where = { id: row.id, version: row.version };
        const n =
          storeId === null
            ? await tx.installationSettingValue.deleteMany({ where })
            : await tx.storeSettingValue.deleteMany({ where });
        if (n.count !== 1) throw new SettingsError('VERSION_CONFLICT', key, 'changed by someone else meanwhile');
        await tx.settingChange.create({
          data: {
            storeId,
            key,
            action: 'RESET_TO_DEFAULT',
            oldValue: jsonValue(row.value),
            newValue: Prisma.DbNull,
            reason: req.reason ?? null,
            actorId: req.actorId ?? null,
          },
        });
        return { changed: true, oldValue: row.value, version: 0 };
      });
    },
  };
}
