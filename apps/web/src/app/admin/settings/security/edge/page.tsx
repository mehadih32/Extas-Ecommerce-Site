// S18 · PR 386 (Blueprint B6.1, B6.3) — Settings › Sign-in & security › Cloudflare protection at
// /admin/settings/security/edge: the shop's own rules at Cloudflare (the plan, `edge.shield`), what Cloudflare has now
// against it, and "Send to Cloudflare". Cloudflare's DDoS protection is always on; every rule covers only the shop's
// host names, and every other rule of the zone is kept as it is (lib/admin-edge). The mock answers until the token
// passes. Seeing needs `security.read`; saving the plan `settings.write`; sending `security.write` (the API checks
// again); the sign-in limit is the owner's alone.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { EDGE_SECURITY_LEVELS } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { EdgeSend } from '@/components/admin/settings/EdgeSend';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { edgeView, PROBE_TEXT_MAX } from '@/lib/admin-edge/service';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-edge.bn.json';
import en from '../../../../../../messages/admin-edge.en.json';
import '../../settings.css';
import '../../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/security/edge';
const API = '/api/admin/edge';
const KEY = 'edge';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'edg.metaTitle'), robots: { index: false, follow: false } };
}

export default async function EdgePage() {
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
  const v = await edgeView({ db: access.deps.db, resolver: access.deps.resolver, vault: access.deps.vault }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `edg.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone }).format(new Date(iso));
  const mock = v.link.mode === 'MOCK';
  const diff = new Map(v.state.differences.map((x) => [x.ref, x.kind]));
  const extras = v.state.differences.filter((x) => x.kind === 'extra');
  const stateKpi = v.state.error ? s('kpi.unread') : !v.rules.length && !extras.length ? s('kpi.noRules') : v.state.differences.length ? s('kpi.differ', { n: num(v.state.differences.length) }) : s('kpi.inLine');
  const hostsLine = v.hostsFrom === 'none' ? s('hosts.none') : s(`hosts.${v.hostsFrom}`, { list: v.hosts.join(', ') });

  const texts: FieldsCardTexts = {
    h: s('card.h'),
    d: s('card.d'),
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'OWNER_ONLY', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  };
  const fields: FieldsCardField[] = [
    { kind: 'select', path: 'securityLevel', label: s('card.securityLevel'), help: s('card.securityLevelHelp'), options: EDGE_SECURITY_LEVELS.map((x) => ({ value: x, label: s(`card.lvl_${x}`) })) },
    { kind: 'switch', path: 'browserCheck', label: s('card.browserCheck'), help: s('card.browserCheckHelp') },
    { kind: 'switch', path: 'sslStrict', label: s('card.sslStrict'), help: s('card.sslStrictHelp') },
    { kind: 'switch', path: 'blockProbes', label: s('card.blockProbes') },
    { kind: 'text', path: 'probePaths', label: s('card.probePaths'), help: s('card.probePathsHelp'), max: PROBE_TEXT_MAX },
    { kind: 'switch', path: 'adminChallenge', label: s('card.adminChallenge'), help: s('card.adminChallengeHelp') },
    { kind: 'number', path: 'adminLoginPer10s', label: s('card.adminLoginPer10s'), help: s('card.adminLoginPer10sHelp'), min: 0, max: 1000 },
  ];
  const sendTexts = {
    send: s('send.send'),
    sending: s('send.sending'),
    sent: s('send.sent'),
    err: Object.fromEntries(['NO_HOST', 'NOT_LIVE', 'SEND_FAILED', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`send.err.${c}`)])),
  };
  const lastLine = v.lastSent ? s('send.last', { at: when(v.lastSent.at), what: v.lastSent.changed.length ? v.lastSent.changed.map((x) => s(`send.phase.${x}`)).join(', ') : s('send.nothing') }) : s('send.never');
  const rows = [...v.rules.map((r) => ({ ref: r.ref, st: diff.get(r.ref) ?? 'ok' })), ...extras.map((x) => ({ ref: x.ref, st: 'extra' as const }))];

  return (
    <div className="a2-z" data-testid="edge-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        <div className="a2-card a2-kpi" data-testid="edge-kpi-link" data-mode={v.link.mode}>
          <div className="a2-kl">{s('kpi.link')}</div>
          <div className="a2-kv a2-sm a2-kvw">{mock ? s('kpi.mock') : s('kpi.live')}</div>
          <div className="a2-kf">
            <span className="a2-kn">{mock ? s('kpi.mockFoot') : s('kpi.liveFoot')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="edge-kpi-rules">
          <div className="a2-kl">{s('kpi.rules')}</div>
          <div className="a2-kv">{num(v.rules.length)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.rulesFoot')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="edge-kpi-state" data-differ={v.state.differences.length}>
          <div className="a2-kl">{s('kpi.state')}</div>
          <div className="a2-kv a2-sm a2-kvw">{stateKpi}</div>
          <div className="a2-kf">
            <span className="a2-kn">{v.state.differences.length ? s('kpi.differFoot') : ''}</span>
          </div>
        </div>
      </div>

      <div className="a2-note a2-mt12" role="note">
        <ShellIcon name="shield" size={15} />
        <span>{s('ddos')}</span>
      </div>
      <div className="a2-note a2-mt12" role="status" data-testid="edge-hosts" data-from={v.hostsFrom}>
        <ShellIcon name={v.hostsFrom === 'none' ? 'alert' : 'globe'} size={15} />
        <span>{hostsLine}</span>
      </div>
      {v.state.error ? (
        <div className="a2-note a2-mt12" role="alert">
          <ShellIcon name="alert" size={15} />
          <span>{s('readError', { why: v.state.error })}</span>
        </div>
      ) : null}

      {rows.length ? (
        <section className="a2-sc a2-mt12" aria-labelledby="edge-rules-h" data-testid="edge-rules">
          <div className="a2-sch">
            <h2 className="a2-h3" id="edge-rules-h">
              {s('table.h')}
            </h2>
          </div>
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{s('table.rule')}</th>
                  <th>{s('table.does')}</th>
                  <th>{s('table.state')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ref} data-ref={r.ref}>
                    <td>{s(`rule.${r.ref}`)}</td>
                    <td className="a2-sm">{s(`does.${r.ref}`)}</td>
                    <td>
                      <span className={`a2-pill ${r.st === 'ok' ? 'ok' : r.st === 'extra' ? 'line' : 'warn'}`}>{s(`st.${r.st}`)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="edge-send-h" data-testid="edge-send-card">
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id="edge-send-h">
              {s('send.h')}
            </h2>
            <p className="a2-scd">{s('send.d')}</p>
          </div>
        </div>
        <div className="a2-mt12">
          {v.canSend ? <EdgeSend url={API} texts={sendTexts} disabled={!v.hosts.length} /> : <p className="a2-sm a2-mute">{s('send.noPerm')}</p>}
          <p className="a2-xs a2-mute a2-mt12" data-testid="edge-last">
            {lastLine}
          </p>
        </div>
      </section>

      <FieldsCard url={API} screen={{ key: v.cards.shield.key, value: v.cards.shield.value, version: v.cards.shield.version }} fields={fields} texts={texts} canEdit={canEdit} testId="edge-plan" />
    </div>
  );
}
