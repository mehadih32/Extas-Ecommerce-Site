// S18 · PR 380 (B6.1, B6.5) — the admin's optional address list, applied at its doors: every admin API call
// (guardAdmin), the sign-in and its 2FA step, and so every admin page (shellSession → guardAdmin). Off by default.
// Break-glass: `EXTAS_ADMIN_ALLOWLIST_OFF=1` in the server's environment opens the admin again whatever the list says
// (set on the VM only; docs/admin-guide/pages/settings/security.md). A setting that cannot be read never locks anyone
// out: the list counts as off (the sign-in, 2FA and the wrong-try pause still guard the door).
import { addressOnList } from '@extas/auth';
import { registry, type AdminIpAllowlist } from '@extas/settings';
import type { AppResolver } from '../settings';

export const ALLOWLIST_BREAK_GLASS_ENV = 'EXTAS_ADMIN_ALLOWLIST_OFF';

/** The list as it applies now (off when the server's break-glass switch is set or the setting cannot be read). */
export async function adminAllowlist(resolver: Pick<AppResolver, 'value'>, env: Record<string, string | undefined> = process.env): Promise<AdminIpAllowlist> {
  if (env[ALLOWLIST_BREAK_GLASS_ENV] === '1') return registry['security.adminIpAllowlist'].default;
  try {
    return await resolver.value('security.adminIpAllowlist');
  } catch {
    return registry['security.adminIpAllowlist'].default;
  }
}

/** True when the list is on and this address is not on it. */
export async function addressRefused(resolver: Pick<AppResolver, 'value'>, ip: string | null | undefined, env?: Record<string, string | undefined>): Promise<boolean> {
  const list = await adminAllowlist(resolver, env);
  return list.enabled && !addressOnList(ip, list.entries);
}
