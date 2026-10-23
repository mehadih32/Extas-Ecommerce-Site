// PR 15 — every rule of sign-in comes from settings (group `security`, packages/settings/src/registry.ts). Nothing
// here is a number of its own: `securityPolicy` reads the values through the resolver (store value → installation
// value → declared default), and `defaultSecurityPolicy` is the declared defaults, for tests and tools.
import { registry, type Registry, type SettingsResolver } from '@extas/settings';

export interface SecurityPolicy {
  staffPasswordMinLength: number;
  customerPasswordMinLength: number;
  passwordMaxLength: number;
  blockCommonPasswords: boolean;
  staffSessionIdleMinutes: number;
  staffSessionMaxHours: number;
  customerSessionDays: number;
  loginMaxAttempts: number;
  loginLockoutMinutes: number;
  staffTwoFactorRequired: boolean;
  twoFactorChallengeMinutes: number;
  totpDriftSteps: number;
  staffLoginAlerts: boolean;
}

const KEYS = {
  staffPasswordMinLength: 'security.staffPasswordMinLength',
  customerPasswordMinLength: 'security.customerPasswordMinLength',
  passwordMaxLength: 'security.passwordMaxLength',
  blockCommonPasswords: 'security.blockCommonPasswords',
  staffSessionIdleMinutes: 'security.staffSessionIdleMinutes',
  staffSessionMaxHours: 'security.staffSessionMaxHours',
  customerSessionDays: 'security.customerSessionDays',
  loginMaxAttempts: 'security.loginMaxAttempts',
  loginLockoutMinutes: 'security.loginLockoutMinutes',
  staffTwoFactorRequired: 'security.staffTwoFactorRequired',
  twoFactorChallengeMinutes: 'security.twoFactorChallengeMinutes',
  totpDriftSteps: 'security.totpDriftSteps',
  staffLoginAlerts: 'security.staffLoginAlerts',
} as const satisfies Record<keyof SecurityPolicy, keyof Registry>;

/** The declared defaults of the security settings. */
export function defaultSecurityPolicy(overrides: Partial<SecurityPolicy> = {}): SecurityPolicy {
  const out = {} as Record<string, unknown>;
  for (const [field, key] of Object.entries(KEYS)) out[field] = registry[key].default;
  return { ...(out as unknown as SecurityPolicy), ...overrides };
}

/** The effective security settings, for one store (customer rules may differ per store) or installation-wide. */
export async function securityPolicy(resolver: Pick<SettingsResolver<Registry>, 'value'>, opts: { storeId?: number } = {}): Promise<SecurityPolicy> {
  const entries = await Promise.all(
    Object.entries(KEYS).map(async ([field, key]) => [field, await resolver.value(key, opts)] as const),
  );
  return Object.fromEntries(entries) as unknown as SecurityPolicy;
}
