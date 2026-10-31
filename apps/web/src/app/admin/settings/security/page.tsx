// S18 · PR 380 — SET-04d Settings › Sign-in & security at /admin/settings/security (docs/BACKEND-ARCHITECTURE.md §5.13;
// Blueprint B6.1, B6.5): how many staff use two-step sign-in and the switch that makes it required; how long a login
// lasts and the wrong-password pause; new-device sign-in notes; the admin address list (off by default) with the
// address the page is opened from; the shop's quiet protections (page protection PR 378, request limits PR 378, the
// bot check PR 379), their numbers under "More options"; your own logins with "Log out everywhere else"; the latest
// security events. Seeing needs `security.read`; saving a card `security.write` (the API checks again).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { registry, type Key } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { AllowlistCard, DevicesCard, type AllowlistScreen } from '@/components/admin/settings/SecurityScreen';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { dateTime } from '@/components/admin/stock/text';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { securityView, type SecurityCard, type SecurityCardId } from '@/lib/admin-security/service';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-security.bn.json';
import en from '../../../../../messages/admin-security.en.json';
import '../settings.css';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/security';
const API = '/api/admin/security';
const KEY = 'security';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, secp: (view.lang === 'bn' ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'secp.metaTitle'), robots: { index: false, follow: false } };
}

/** The min and max a number field may take, from its setting's own schema (nothing typed twice). */
function bounds(key: Key, sub?: string): { min: number; max: number } {
  let s = registry[key].schema as unknown as { shape?: Record<string, unknown>; minValue?: number | null; maxValue?: number | null };
  if (sub && s.shape) s = s.shape[sub] as typeof s;
  return { min: s.minValue ?? 0, max: s.maxValue ?? Number.MAX_SAFE_INTEGER };
}

/** Flattens a nested messages object into dotted keys for the client cards. */
function flat(o: Record<string, unknown>, at = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') out[`${at}${k}`] = v;
    else if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, `${at}${k}.`));
  }
  return out;
}

export default async function SecurityPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('security.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="security.read" />
      </div>
    );
  const v = await securityView({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('security.write') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `secp.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const texts = (card: string): FieldsCardTexts => ({
    h: s(`${card}.h`),
    d: s(`${card}.d`),
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'ADDRESS_NOT_ON_LIST', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  });
  const screen = (k: SecurityCardId) => {
    const c: SecurityCard = v.cards[k];
    return { key: c.key, value: c.value, version: c.version };
  };
  const n = (path: string, key: Key, sub?: string, label = s(`signIn.${path}`)): FieldsCardField => ({ kind: 'number', path, label, ...bounds(key, sub) });
  const signIn: FieldsCardField[] = [
    { kind: 'switch', path: 'twoFactor', label: s('signIn.twoFactor'), help: s('signIn.twoFactorHelp') },
    n('idleMinutes', 'security.staffSessionIdleMinutes'),
    n('maxHours', 'security.staffSessionMaxHours'),
    n('maxAttempts', 'security.loginMaxAttempts'),
    n('lockoutMinutes', 'security.loginLockoutMinutes'),
    { kind: 'switch', path: 'loginAlerts', label: s('signIn.loginAlerts'), help: s('signIn.loginAlertsHelp') },
    n('noteDays', 'security.newLoginNoteDays'),
  ];
  const modes = (list: readonly string[]) => list.map((m) => ({ value: m, label: s(`mode.${m}`) }));
  const protection: FieldsCardField[] = [
    { kind: 'select', path: 'csp', label: s('protection.csp'), help: s('protection.cspHelp'), options: modes(['report', 'enforce', 'off']) },
    { kind: 'select', path: 'rate', label: s('protection.rate'), help: s('protection.rateHelp'), options: modes(['observe', 'enforce', 'off']) },
    { kind: 'select', path: 'bot', label: s('protection.bot'), help: s('protection.botHelp'), options: modes(['observe', 'off']) },
  ];
  const limits: FieldsCardField[] = (['signIn', 'checkout', 'shopWrite', 'report', 'webhook'] as const).map((b) => n(b, 'security.rateLimit.perMinute', b, s(`limits.${b}`)));
  const bot: FieldsCardField[] = [
    n('checkoutSeconds', 'security.bot.minFillSeconds', 'checkout', s('bot.checkoutSeconds')),
    n('signInSeconds', 'security.bot.minFillSeconds', 'signIn', s('bot.signInSeconds')),
    n('adminSignInSeconds', 'security.bot.minFillSeconds', 'adminSignIn', s('bot.adminSignInSeconds')),
    n('noteScore', 'security.bot.noteScore', undefined, s('bot.noteScore')),
  ];
  const sv = v.cards.signIn.value as { twoFactor: boolean };
  const pv = v.cards.protection.value as { csp: string; rate: string };
  const list = v.cards.allowlist.value as { enabled: boolean };
  const words = flat((view.lang === 'bn' ? bn : en) as unknown as Record<string, unknown>);
  // An event's kind ("staff.login.newDevice") is looked up as "staff_login_newDevice" (the words' keys have no dots).
  const kindOf = (k: string) => {
    const key = `events.kind.${k.replace(/\./g, '_')}`;
    const said = s(key);
    return said === key || said.startsWith('secp.') ? s('events.kind.other') : said;
  };
  const fieldOf = (k: string) => {
    const said = s(`events.field.${k}`);
    return said.startsWith('secp.') ? k : said;
  };
  const valueOf = (x: unknown) => (typeof x === 'boolean' ? s(x ? 'events.yes' : 'events.no') : Array.isArray(x) ? x.join(', ') : String(x));
  const detailOf = (x: Record<string, unknown>) =>
    Object.entries(x)
      .map(([k, val]) => `${fieldOf(k)}: ${valueOf(val)}`)
      .join(' · ');

  return (
    <div className="a2-z" data-testid="security-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        <div className="a2-card a2-kpi" data-testid="security-kpi-2fa" data-required={sv.twoFactor ? 'yes' : 'no'}>
          <div className="a2-kl">{s('kpi.twoFactor')}</div>
          <div className="a2-kv">{s('kpi.twoFactorOf', { n: num(v.staff.twoFactor), total: num(v.staff.active) })}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s(sv.twoFactor ? 'kpi.required' : 'kpi.optional')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="security-kpi-list">
          <div className="a2-kl">{s('kpi.list')}</div>
          <div className="a2-kv a2-sm a2-kvw">{v.breakGlass ? s('kpi.breakGlass') : s(list.enabled ? 'kpi.listOn' : 'kpi.listOff')}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{s('kpi.protection')}</div>
          <div className="a2-kv a2-sm a2-kvw">{s(`mode.${pv.csp}`)}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{s('kpi.limits')}</div>
          <div className="a2-kv a2-sm a2-kvw">{s(`mode.${pv.rate}`)}</div>
        </div>
      </div>

      {!sv.twoFactor ? (
        <div className="a2-note a2-mt12" data-testid="security-advice-2fa">
          <ShellIcon name="shield" size={16} />
          <div>{s('advice2fa')}</div>
        </div>
      ) : null}

      <FieldsCard url={API} screen={screen('signIn')} fields={signIn} texts={texts('signIn')} canEdit={canEdit} testId="security-signin" />
      <AllowlistCard screen={screen('allowlist') as unknown as AllowlistScreen} ip={v.address.ip} breakGlass={v.breakGlass} canEdit={canEdit} w={words} />
      <FieldsCard url={API} screen={screen('protection')} fields={protection} texts={texts('protection')} canEdit={canEdit} testId="security-protection" />
      <DevicesCard w={words} locale={view.locale} timeZone={view.timeZone} />

      <section className="a2-card a2-mt12" aria-labelledby="security-events-h" data-testid="security-events">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="security-events-h">
              {s('events.h')}
            </h2>
            <div className="a2-cs">{s('events.d')}</div>
          </div>
        </div>
        {v.events.length ? (
          <div className="a2-tblw">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{s('events.when')}</th>
                  <th>{s('events.what')}</th>
                  <th>{s('events.level')}</th>
                  <th>{s('events.detail')}</th>
                </tr>
              </thead>
              <tbody>
                {v.events.map((e) => (
                  <tr key={e.id}>
                    <td className="a2-tdh">{dateTime(e.at, view.locale, view.timeZone)}</td>
                    <td data-l={s('events.what')}>{kindOf(e.kind)}</td>
                    <td data-l={s('events.level')}>{['info', 'warning', 'critical'].includes(e.severity) ? s(`events.severity.${e.severity}`) : e.severity}</td>
                    <td data-l={s('events.detail')} className="a2-xs">
                      {detailOf(e.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-xs a2-mute a2-mt12" data-testid="security-events-none">
            {s('events.none')}
          </p>
        )}
      </section>

      <details className="a2-card a2-mt12" data-testid="security-more">
        <summary className="a2-h4">{s('more')}</summary>
        <p className="a2-xs a2-mute a2-mt6">{s('moreSub')}</p>
        <FieldsCard url={API} screen={screen('limits')} fields={limits} texts={texts('limits')} canEdit={canEdit} testId="security-limits" />
        <FieldsCard url={API} screen={screen('bot')} fields={bot} texts={texts('bot')} canEdit={canEdit} testId="security-bot" />
      </details>
    </div>
  );
}
