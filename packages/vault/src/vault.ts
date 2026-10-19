// The credential vault (PR 493). Every key the shop uses — courier, SMS, payment, AI, ads, Drive, Telegram — is typed
// in by the owner on the admin "Keys & connections" page (PR 500) and stored here encrypted. Adapters ask for a secret
// by name; every decrypt is logged (which service, why, when — never the value). Values never leave through `list`.
// Nothing is deleted: revoking keeps the row (rule 3) and makes the value unreadable to adapters.
import type { PrismaClient } from '@extas/db';
import { aadFor, ALGORITHM, deriveKek, newDataKey, open, seal, unwrapDataKey, wrapDataKey } from './crypto';

export const MASTER_KEY_REF = 'env:VAULT_MASTER_KEY';
const NAME = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;
/** Prisma's Bytes columns take a plain Uint8Array over an ArrayBuffer. */
const bytes = (b: Buffer) => new Uint8Array(b);

export type Scope = { storeId?: number | null };
export type Who = { actorId?: string | null; service: string; purpose?: string };
export type SecretInfo = { name: string; storeId: number | null; revoked: boolean; keyVersion: number; updatedAt: Date };

type Db = Pick<PrismaClient, 'vaultKey' | 'installationSecret' | 'storeSecret' | 'secretAccessLog' | '$transaction'>;

export class VaultError extends Error {}

/** A value sealed by `sealValue`, as it is stored in its own row's Bytes columns. */
export type SealedValue = { ciphertext: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; authTag: Uint8Array<ArrayBuffer>; keyVersion: number };

export function assertName(name: string) {
  if (!NAME.test(name)) throw new VaultError(`secret name must look like "provider.field", got "${name}"`);
}

export function createVault(db: Db, masterKey: string | undefined = process.env.VAULT_MASTER_KEY) {
  const kek = deriveKek(masterKey ?? '');
  const keys = new Map<number, Buffer>();

  async function dataKey(version: number): Promise<Buffer> {
    const cached = keys.get(version);
    if (cached) return cached;
    const row = await db.vaultKey.findUnique({ where: { version } });
    if (!row) throw new VaultError(`vault key version ${version} not found`);
    const key = unwrapDataKey(kek, Buffer.from(row.wrappedDataKey), version);
    keys.set(version, key);
    return key;
  }

  /** The active key version, created on first use (version 1). */
  async function activeKey(actorId?: string | null): Promise<{ version: number; key: Buffer }> {
    const row = await db.vaultKey.findFirst({
      where: { activatedAt: { not: null }, retiredAt: null },
      orderBy: { version: 'desc' },
    });
    if (row) return { version: row.version, key: await dataKey(row.version) };
    try {
      return await createKey(1, actorId);
    } catch (e) {
      // Two first writes at once: the other one created version 1; use it.
      const again = await db.vaultKey.findUnique({ where: { version: 1 } });
      if (!again) throw e;
      return { version: 1, key: await dataKey(1) };
    }
  }

  async function createKey(version: number, actorId?: string | null) {
    const key = newDataKey();
    await db.vaultKey.create({
      data: {
        version,
        algorithm: ALGORITHM,
        masterKeyRef: MASTER_KEY_REF,
        wrappedDataKey: bytes(wrapDataKey(kek, key, version)),
        activatedAt: new Date(),
        createdById: actorId ?? null,
      },
    });
    keys.set(version, key);
    return { version, key };
  }

  async function log(name: string, storeId: number | null, action: 'CREATE' | 'REPLACE' | 'ROTATE' | 'REVOKE' | 'DECRYPT' | 'TEST', who: Who) {
    await db.secretAccessLog.create({
      data: { storeId, secretName: name, action, service: who.service, purpose: who.purpose ?? null, actorId: who.actorId ?? null },
    });
  }

  function findRow(name: string, storeId: number | null) {
    return storeId == null
      ? db.installationSecret.findUnique({ where: { name } })
      : db.storeSecret.findUnique({ where: { storeId_name: { storeId, name } } });
  }

  return {
    /** Store or replace a secret. An empty value is refused: revoke instead. */
    async put(name: string, value: string, scope: Scope, who: Who) {
      assertName(name);
      if (!value) throw new VaultError('empty secret — use revoke to switch a key off');
      const storeId = scope.storeId ?? null;
      const { version, key } = await activeKey(who.actorId);
      const s = seal(key, Buffer.from(value, 'utf8'), aadFor(name, storeId));
      const fields = { ciphertext: bytes(s.ciphertext), iv: bytes(s.iv), authTag: bytes(s.authTag), keyVersion: version, revokedAt: null, updatedById: who.actorId ?? null };
      const existing = await findRow(name, storeId);
      if (storeId == null) {
        await db.installationSecret.upsert({ where: { name }, create: { name, ...fields, createdById: who.actorId ?? null }, update: fields });
      } else {
        await db.storeSecret.upsert({
          where: { storeId_name: { storeId, name } },
          create: { storeId, name, ...fields, createdById: who.actorId ?? null },
          update: fields,
        });
      }
      await log(name, storeId, existing ? 'REPLACE' : 'CREATE', who);
    },

    /** The secret's value for an adapter, or null when it was never set or is revoked. Every read is logged. */
    async get(name: string, scope: Scope, who: Who): Promise<string | null> {
      assertName(name);
      const storeId = scope.storeId ?? null;
      const row = await findRow(name, storeId);
      if (!row || row.revokedAt) return null;
      const value = open(await dataKey(row.keyVersion), {
        ciphertext: Buffer.from(row.ciphertext), iv: Buffer.from(row.iv), authTag: Buffer.from(row.authTag),
      }, aadFor(name, storeId)).toString('utf8');
      await log(name, storeId, 'DECRYPT', who);
      return value;
    },

    /** Switch a secret off. The row stays (nothing is deleted); a later put brings it back. */
    async revoke(name: string, scope: Scope, who: Who) {
      assertName(name);
      const storeId = scope.storeId ?? null;
      const at = new Date();
      if (storeId == null) await db.installationSecret.update({ where: { name }, data: { revokedAt: at, updatedById: who.actorId ?? null } });
      else await db.storeSecret.update({ where: { storeId_name: { storeId, name } }, data: { revokedAt: at, updatedById: who.actorId ?? null } });
      await log(name, storeId, 'REVOKE', who);
    },

    /**
     * PR 15 — encrypts a value that lives in another table's columns (a staff member's TOTP seed) with the active data
     * key. `aad` binds it to its row, so a ciphertext copied onto another row does not open. Data-key rotation leaves
     * these values on their key version; retired keys are never deleted, so they stay readable.
     */
    async sealValue(aad: string, plaintext: Buffer, who: Who): Promise<SealedValue> {
      const { version, key } = await activeKey(who.actorId);
      const s = seal(key, plaintext, aad);
      return { ciphertext: bytes(s.ciphertext), iv: bytes(s.iv), authTag: bytes(s.authTag), keyVersion: version };
    },

    /** Opens a value sealed by `sealValue`. Throws when the row, the key or any byte is wrong. Not logged per read. */
    async openValue(aad: string, sealed: SealedValue): Promise<Buffer> {
      return open(await dataKey(sealed.keyVersion), {
        ciphertext: Buffer.from(sealed.ciphertext), iv: Buffer.from(sealed.iv), authTag: Buffer.from(sealed.authTag),
      }, aad);
    },

    /** What is set, for the Keys & connections page — names and dates only, never a value. */
    async list(scope: Scope): Promise<SecretInfo[]> {
      const storeId = scope.storeId ?? null;
      const rows = storeId == null
        ? await db.installationSecret.findMany({ orderBy: { name: 'asc' } })
        : await db.storeSecret.findMany({ where: { storeId }, orderBy: { name: 'asc' } });
      return rows.map((r) => ({ name: r.name, storeId, revoked: r.revokedAt != null, keyVersion: r.keyVersion, updatedAt: r.updatedAt }));
    },

    /** New data key; every live secret is re-encrypted with it in one transaction, then the old keys are retired. */
    async rotateDataKey(who: Who): Promise<number> {
      const current = await activeKey(who.actorId);
      // Revoked secrets keep their old key version: retired keys are never deleted, so they stay readable for audit.
      const inst = await db.installationSecret.findMany({ where: { revokedAt: null } });
      const store = await db.storeSecret.findMany({ where: { revokedAt: null } });
      const plain = await Promise.all([
        ...inst.map(async (r) => ({ kind: 'i' as const, id: r.id, name: r.name, storeId: null,
          value: open(await dataKey(r.keyVersion), { ciphertext: Buffer.from(r.ciphertext), iv: Buffer.from(r.iv), authTag: Buffer.from(r.authTag) }, aadFor(r.name, null)) })),
        ...store.map(async (r) => ({ kind: 's' as const, id: r.id, name: r.name, storeId: r.storeId,
          value: open(await dataKey(r.keyVersion), { ciphertext: Buffer.from(r.ciphertext), iv: Buffer.from(r.iv), authTag: Buffer.from(r.authTag) }, aadFor(r.name, r.storeId)) })),
      ]);
      const version = current.version + 1;
      const key = newDataKey();
      const now = new Date();
      await db.$transaction(async (tx) => {
        await tx.vaultKey.create({ data: { version, algorithm: ALGORITHM, masterKeyRef: MASTER_KEY_REF, wrappedDataKey: bytes(wrapDataKey(kek, key, version)), activatedAt: now, createdById: who.actorId ?? null } });
        for (const p of plain) {
          const s = seal(key, p.value, aadFor(p.name, p.storeId));
          const data = { ciphertext: bytes(s.ciphertext), iv: bytes(s.iv), authTag: bytes(s.authTag), keyVersion: version, rotatedAt: now };
          if (p.kind === 'i') await tx.installationSecret.update({ where: { id: p.id }, data });
          else await tx.storeSecret.update({ where: { id: p.id }, data });
          await tx.secretAccessLog.create({ data: { storeId: p.storeId, secretName: p.name, action: 'ROTATE', service: who.service, purpose: who.purpose ?? null, actorId: who.actorId ?? null } });
        }
        await tx.vaultKey.updateMany({ where: { version: { lt: version }, retiredAt: null }, data: { retiredAt: now } });
      });
      keys.set(version, key);
      return version;
    },
  };
}

/** Master-key rotation: re-wrap every data key from the old master key to the new one. Secrets are untouched. */
export async function rewrapMasterKey(db: Db, oldMaster: string, newMaster: string): Promise<number> {
  const from = deriveKek(oldMaster);
  const to = deriveKek(newMaster);
  const rows = await db.vaultKey.findMany();
  await db.$transaction(async (tx) => {
    for (const r of rows) {
      const key = unwrapDataKey(from, Buffer.from(r.wrappedDataKey), r.version);
      await tx.vaultKey.update({ where: { id: r.id }, data: { wrappedDataKey: bytes(wrapDataKey(to, key, r.version)) } });
    }
  });
  return rows.length;
}

export type Vault = ReturnType<typeof createVault>;
