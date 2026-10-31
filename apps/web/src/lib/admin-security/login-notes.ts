// S18 · PR 380 — SET-04d new-login alerts in the admin: the notifications drawer shows each staff sign-in from a
// browser not seen before (the `staff.login.newDevice` security event that sign-in writes while
// `security.staffLoginAlerts` is on) to the people who may see security (`security.read`), for
// `security.newLoginNoteDays` days. Only the person's name and the device are shown, never the full address. The
// Telegram alert (PR 9) reads the same event.
import type { PrismaClient } from '@extas/db/client';
import type { AdminLang } from '../admin-i18n';
import { adminDicts } from '../admin-i18n';
import { t } from '../i18n';
import type { AppResolver } from '../settings';
import { deviceName } from './device';

export interface LoginNote {
  id: string;
  title: string;
  body: string;
  href: string;
  at: string;
}

/** The page the notes link to. */
export const SECURITY_PAGE = '/admin/settings/security';
/** Most notes the drawer shows at once. */
const MOST = 20;
const DAY_MS = 86_400_000;

const str = (v: unknown) => (typeof v === 'string' ? v : null);

/** The new-device sign-ins of the last `security.newLoginNoteDays` days, newest first. */
export async function loginNotes(
  deps: { db: PrismaClient; resolver: AppResolver },
  lang: AdminLang,
  opts: { now?: Date; locale: string; timeZone: string },
): Promise<LoginNote[]> {
  const days = (await deps.resolver.value('security.newLoginNoteDays')) as number;
  const now = opts.now ?? new Date();
  const rows = await deps.db.securityEvent.findMany({
    where: { kind: 'staff.login.newDevice', createdAt: { gte: new Date(now.getTime() - days * DAY_MS) } },
    orderBy: { createdAt: 'desc' },
    take: MOST,
  });
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => str((r.details as Record<string, unknown> | null)?.staffUserId)).filter((x): x is string => !!x))];
  const people = await deps.db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
  const names = new Map(people.map((p) => [p.id, p.displayName]));
  const dict = adminDicts[lang];
  const when = new Intl.DateTimeFormat(opts.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: opts.timeZone });
  return rows.map((r) => {
    const d = (r.details ?? {}) as Record<string, unknown>;
    const who = names.get(str(d.staffUserId) ?? '') ?? t(dict, 'shell.ntf.newDevice.someone');
    return {
      id: r.id,
      title: t(dict, 'shell.ntf.newDevice.title'),
      body: [who, deviceName(str(d.userAgent)), when.format(r.createdAt)].join(' · '),
      href: SECURITY_PAGE,
      at: r.createdAt.toISOString(),
    };
  });
}
