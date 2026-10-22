// @extas/vault — the credential vault (PR 493): where every integration key the shop uses is kept, encrypted. The
// owner types keys in on the admin "Keys & connections" page (PR 500); adapters ask for a secret by name (vault.ts).
// Each value is sealed with its own data key wrapped by the master key (crypto.ts), every decrypt is logged without
// the value, keys can be revoked (never deleted) and the master key re-wrapped (rewrapMasterKey).
export { createVault, rewrapMasterKey, VaultError, assertName, MASTER_KEY_REF } from './vault';
export type { Vault, Scope, Who, SecretInfo, SealedValue } from './vault';
export { aadFor, deriveKek } from './crypto';
