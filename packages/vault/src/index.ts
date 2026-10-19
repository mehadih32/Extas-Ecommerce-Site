// @extas/vault — the credential vault (PR 493). See src/vault.ts.
export { createVault, rewrapMasterKey, VaultError, assertName, MASTER_KEY_REF } from './vault';
export type { Vault, Scope, Who, SecretInfo, SealedValue } from './vault';
export { aadFor, deriveKek } from './crypto';
