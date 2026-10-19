// PR 491 — how a setting is declared. Settings are declared in code as a typed registry (registry.ts); the settings
// migration (PR 496, sync.ts) mirrors the registry into the SettingDefinition table, and the resolver (PR 492,
// resolver.ts) reads values from the database with the registry's default as the last tier.
import type { z } from 'zod';

/**
 * Where a value may live.
 * - `installation`: one value for the whole installation; a store can never override it (schema `INSTALLATION`).
 * - `store`: an installation value inherited by every store unless the store overrides it (schema `INHERITED`).
 */
export type SettingScopeKind = 'installation' | 'store';

/** Mirrors the schema's `SettingValueType` enum (checked against the generated client in prisma-backend.ts). */
export type SettingValueTypeName =
  | 'STRING'
  | 'TEXT'
  | 'INT'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'ENUM'
  | 'JSON'
  | 'MONEY_MINOR'
  | 'DURATION_SECONDS'
  | 'COLOR'
  | 'URL'
  | 'EMAIL'
  | 'PHONE'
  | 'MEDIA_REF'
  | 'SECRET_REF'
  | 'LOCALIZED_TEXT';

export interface SettingSpec<S extends z.ZodType = z.ZodType> {
  /** Validates every value read from or written to the database. */
  schema: S;
  /** What "Reset to default" restores at installation level (PR 510). Must pass `schema`. */
  default: z.output<S>;
  scope: SettingScopeKind;
  /** How the admin edits it (the schema's SettingValueType). */
  valueType: SettingValueTypeName;
  /** Admin group, e.g. `store`, `system`. */
  group: string;
  /** Dotted key of the label in `messages/settings.<lang>.json`. */
  labelKey: string;
  /** Dotted key of the help text, if any. */
  helpKey?: string;
  /** PR 509: the owner's own data — never exported to a new installation and never returned by the admin list API. */
  isOwnerData: boolean;
  /** May be sent to the storefront bundle (non-sensitive values only). */
  isPublic?: boolean;
  /** Changing it needs the owner's written OK (CLAUDE.md rule 6). */
  requiresOwnerOk?: boolean;
  /** Order inside the group in the admin. */
  sortOrder?: number;
  /**
   * Registry version at which this definition was introduced or last changed (default, schema, labels, flags). Bump it
   * to the next registry version whenever the definition changes; the settings migration records each version once.
   */
  version: number;
  /** Registry version that introduced the key; defaults to `version` on first sync. */
  since?: number;
}

/** Declares one setting. The helper only exists so TypeScript checks `default` against `schema`. */
export function setting<S extends z.ZodType>(spec: SettingSpec<S>): SettingSpec<S> {
  return spec;
}

export type RegistryShape = Record<string, SettingSpec>;

export type SettingKey<R extends RegistryShape> = Extract<keyof R, string>;

/** The typed value of a setting. */
export type SettingValue<R extends RegistryShape, K extends SettingKey<R>> = z.output<R[K]['schema']>;

/** The registry's version: the highest definition version. The settings migration records it once. */
export function registryVersion(registry: RegistryShape): number {
  return Object.values(registry).reduce((max, d) => Math.max(max, d.version), 0);
}

/** Where a value is written or reset. */
export type SettingTarget = { level: 'installation' } | { level: 'store'; storeId: number };

export const INSTALLATION: SettingTarget = { level: 'installation' };
export const storeTarget = (storeId: number): SettingTarget => ({ level: 'store', storeId });

/** Where an effective value came from (PR 492). */
export type SettingSource = 'store' | 'installation' | 'default';
