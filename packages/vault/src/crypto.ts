// The vault's cryptography (PR 493), kept free of the database so it is tested on its own.
//
// Envelope encryption:
//   master key (VAULT_MASTER_KEY, generated on the server, only in /srv/extas/config/secrets/app.env)
//     → HKDF-SHA256 → key-encryption key (KEK)
//     → wraps a random 256-bit data key per key version (VaultKey.wrappedDataKey)
//     → the data key encrypts each secret with AES-256-GCM.
// The secret's scope and name are the GCM associated data, so a ciphertext copied onto another secret's row or
// another store does not decrypt. Rotating the master key only re-wraps data keys; rotating a data key re-encrypts
// the secrets that use it.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEK_INFO = 'extas-vault-kek-v1';

export type Sealed = { ciphertext: Buffer; iv: Buffer; authTag: Buffer };

/** The key-encryption key from the master key. The master key must be long and random (the server makes 64 chars). */
export function deriveKek(masterKey: string): Buffer {
  if (!masterKey || masterKey.length < 32) throw new Error('vault master key missing or too short');
  return Buffer.from(hkdfSync('sha256', Buffer.from(masterKey, 'utf8'), Buffer.alloc(0), KEK_INFO, KEY_BYTES));
}

export function seal(key: Buffer, plaintext: Buffer, aad: string): Sealed {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

/** Throws when the key, the associated data or any byte of the sealed value is wrong. */
export function open(key: Buffer, sealed: Sealed, aad: string): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, sealed.iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(sealed.authTag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
}

/** A data key wrapped by the KEK, stored as iv ‖ tag ‖ ciphertext in VaultKey.wrappedDataKey. */
export function wrapDataKey(kek: Buffer, dataKey: Buffer, version: number): Buffer {
  const s = seal(kek, dataKey, `vault-key:${version}`);
  return Buffer.concat([s.iv, s.authTag, s.ciphertext]);
}

export function unwrapDataKey(kek: Buffer, wrapped: Buffer, version: number): Buffer {
  const iv = wrapped.subarray(0, IV_BYTES);
  const authTag = wrapped.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = wrapped.subarray(IV_BYTES + TAG_BYTES);
  return open(kek, { iv, authTag, ciphertext }, `vault-key:${version}`);
}

export function newDataKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

/** Associated data that binds a ciphertext to its place: `installation:<name>` or `store:<id>:<name>`. */
export function aadFor(name: string, storeId: number | null): string {
  return storeId == null ? `installation:${name}` : `store:${storeId}:${name}`;
}
