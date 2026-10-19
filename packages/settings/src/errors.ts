export type SettingsErrorCode =
  /** The key is not in the registry (or was retired). */
  | 'UNKNOWN_KEY'
  /** The value failed the setting's schema. */
  | 'INVALID_VALUE'
  /** A store value for an installation-only setting. */
  | 'WRONG_SCOPE'
  /** The setting needs the owner's written OK (CLAUDE.md rule 6) and none was given. */
  | 'OWNER_OK_REQUIRED'
  /** Someone else saved first (optimistic lock on the value's version). */
  | 'VERSION_CONFLICT'
  /** The store does not exist. */
  | 'UNKNOWN_STORE'
  /** The key has no SettingDefinition row yet: the settings migration (sync) has not run. */
  | 'NOT_SYNCED'
  /** The actor id is not a staff user id (UUID). */
  | 'INVALID_ACTOR';

export class SettingsError extends Error {
  readonly code: SettingsErrorCode;
  readonly key: string;
  readonly issues: readonly string[];

  constructor(code: SettingsErrorCode, key: string, message: string, issues: readonly string[] = []) {
    super(`${key}: ${message}`);
    this.name = 'SettingsError';
    this.code = code;
    this.key = key;
    this.issues = issues;
  }
}
