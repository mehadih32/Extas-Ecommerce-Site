// PR 791 — Settings › Site health at /admin/settings/system/health (prototype v5 m-settings.js `renderHealth`): six lights
// (shop up, nightly page check, backup, restore test, domain & SSL lock, version running) read from what the server already
// writes (lib/status.ts), what the server found, and where alerts go. A light with no data says "Not reported yet"; nothing is
// invented and nothing is switched here. Seeing needs `system.read`.
import { statfsSync } from 'node:fs';
import { freemem, totalmem } from 'node:os';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { HEALTH_AUDIT_EVERY } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { HealthAlertsCard, HealthHeadActions } from '@/components/admin/settings/HealthBoard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { allGreen, lights } from '@/lib/admin-sysinfo/model';
import { buildId } from '@/lib/build-id';
import { loadSyncBoard } from '@/lib/erp-sync-board';
import { siteAddress } from '@/lib/seo/site';
import { t, type Dict } from '@/lib/i18n';
import { runtimeState } from '@/lib/status';
import bn from '../../../../../../messages/admin-sysinfo.bn.json';
import en from '../../../../../../messages/admin-sysinfo.en.json';
import '../../settings.css';
import '../sysinfo.css';
import '../../../s28.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/system/health';
const KEY = 'siteHealth';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'sysinfo.health.metaTitle'), robots: { index: false, follow: false } };
}

export default async function SiteHealthPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('system.read', deps)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-lm-ready="" data-testid="sysinfo-health-page">
        <ShellState view={view} kind="denied" permission="system.read" />
      </div>
    );
  const d = view.dict;
  const h = (k: string, vars?: Record<string, string | number>) => t(d, `sysinfo.health.${k}`, vars);
  const state = await runtimeState();
  const now = new Date();
  const ls = lights(state, now, buildId());
  const notGreen = ls.filter((l) => l.tone === 'warn' || l.tone === 'bad').length;
  const problems = state.health?.problems ?? [];
  const w = (k: string, vars?: Record<string, string | number>) => h(`board.${k}`, vars);
  const words = Object.fromEntries(
    ['ai', 'optimiseNow', 'saved', 'err', 'diag.h', 'diag.off', 'diag.checked', 'diag.checkedText', 'diag.finding', 'diag.healthy', 'diag.problems', 'diag.close', 'alerts.h', 'alerts.telegram', 'alerts.telegramSub', 'alerts.audit', 'alerts.hourly', 'alerts.daily', 'alerts.weekly', 'alerts.sub'].map((k) => [k, w(k)]),
  );
  const [aiOn, checks, site] = await Promise.all([access.deps.resolver.value('ai.enabled'), access.deps.resolver.value('health.checks'), siteAddress(MOTHER_STORE_ID)]);
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const erpLog = await loadSyncBoard(access.deps.db, MOTHER_STORE_ID, now, 0, 5)
    .then((b) => b.log)
    .catch(() => []);
  const erpAt = erpLog[0]?.at ?? null;
  const erpBad = erpLog.slice(0, 5).some((x) => !x.ok);
  const when = (iso: string) => dateTime(iso, view.locale, view.timeZone);
  const light = (id: string) => ls.find((l) => l.id === id)!;
  const lightLine = (id: 'up' | 'nightly' | 'ssl') => {
    const l = light(id);
    return h(`light.${id}.${l.variant}`, l.vars);
  };
  const host = site.origin?.host ?? '';
  // The prototype's six lights, in its order and words; a light with no data says so (nothing is invented).
  const six: { id: string; tone: string; name: string; text: string }[] = [
    { id: 'up', tone: light('up').tone, name: h('light.up.n'), text: lightLine('up') },
    { id: 'speed', tone: 'off', name: w('speed.n'), text: w('speed.none') },
    { id: 'errors', tone: state.health ? (problems.length ? 'bad' : 'ok') : 'off', name: w('errors.n'), text: state.health ? (problems.length ? w('errors.some', { n: problems.length }) : w('errors.ok')) : w('speed.none') },
    { id: 'nightly', tone: light('nightly').tone, name: h('light.nightly.n'), text: lightLine('nightly') },
    { id: 'erp', tone: erpAt ? (erpBad ? 'warn' : 'ok') : 'off', name: w('erp.n'), text: erpAt ? w(erpBad ? 'erp.warn' : 'erp.ok', { when: when(erpAt) }) : w('speed.none') },
    { id: 'ssl', tone: light('ssl').tone, name: h('light.ssl.n'), text: `${host ? `${host} · ` : ''}${lightLine('ssl')}` },
  ];
  // The server room: this server's own disk and memory, read now (the shop's photos are not counted here yet).
  const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0); // hardcode-ok: a percentage of a whole
  const disk = (() => {
    try {
      const f = statfsSync('/');
      return pct((f.blocks - f.bavail) * f.bsize, f.blocks * f.bsize);
    } catch {
      return null;
    }
  })();
  const mem = pct(totalmem() - freemem(), totalmem());
  const barTone = (p: number) => (p >= 90 ? ' bad' : p >= 75 ? ' warn' : ''); // hardcode-ok: the usual disk and memory warning lines

  return (
    <div className="a2-z lm-st" data-lm-ready="" data-testid="sysinfo-health-page">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={h('title')}
        sub={h('sub')}
        right={<HealthHeadActions w={words} optimiseHref="/admin/settings/system/cache" diagnosis={{ aiOff: !aiOn, problems: notGreen + problems.length }} />}
      />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-card a2-mt12" data-testid="hl-six">
        <div className="sy-lights">
          {six.map((l) => (
            <div className="sy-light" key={l.id} data-testid={`hl-light-${l.id}`} data-tone={l.tone}>
              <i className={`sy-dot ${l.tone === 'ok' ? '' : l.tone}`} aria-hidden="true" />
              <div>
                <b>{l.name}</b>
                <span className="a2-scd sy-t">{l.text}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="s28-grid s28-g2 a2-mt12">
        <section className="a2-card" data-testid="hl-uptime">
          <h2 className="a2-h3">{w('uptime.h')}</h2>
          <p className="a2-sm a2-mute a2-mt12">{w('uptime.none')}</p>
          <p className="a2-xs a2-mute a2-mt6">{w('uptime.hint')}</p>
        </section>
        <section className="a2-card" data-testid="hl-room">
          <h2 className="a2-h3">{w('room.h')}</h2>
          {[
            ['disk', disk],
            ['memory', mem],
          ].map(([k, p]) => (
            <div key={k as string} className="a2-mt12">
              <div className="s28-row between">
                <span>{w(`room.${k}`)}</span>
                <b>{p === null ? w('speed.none') : `${p}%`}</b>
              </div>
              {p === null ? null : (
                <div className="sy-bar" role="img" aria-label={`${w(`room.${k}`)} ${p}%`}>
                  <i className={barTone(p as number)} style={{ width: `${p}%` }} />
                </div>
              )}
            </div>
          ))}
          <div className="s28-row between a2-mt12">
            <span>{w('room.photos')}</span>
            <b>{w('speed.none')}</b>
          </div>
        </section>
      </div>

      <div className="s28-grid s28-g2 a2-mt12">
        <HealthAlertsCard w={words} telegram={checks.telegramAlerts} audit={checks.auditEvery} options={HEALTH_AUDIT_EVERY} canEdit={canEdit} />
        <section className="a2-card" data-testid="hl-optimise">
          <h2 className="a2-h3">{w('optimise.h')}</h2>
          <p className="a2-sm a2-mt12">{w('optimise.never')}</p>
          <p className="a2-sm a2-mute a2-mt6">{w('optimise.text')}</p>
        </section>
      </div>

      {/* D10: the six lights the real page had before (shop up, nightly page check, backup, restore test, SSL, version) and what the server found stay, under More options. */}
      <details className="a2-card a2-mt12" data-testid="hl-more">
        <summary className="a2-h3" style={{ cursor: 'pointer', minHeight: 44 }}>
          {w('more')}
        </summary>
        <div className="a2-cs">{w('moreSub')}</div>
      <section className="a2-sc a2-mt12" data-testid="sysinfo-lights" data-green={allGreen(ls) ? '1' : '0'}>
        <p className="a2-scd sy-sum">{notGreen ? h('needs', { n: notGreen }) : h('allGreen')}</p>
        <div className="sy-lights">
          {ls.map((l) => (
            <div className="sy-light" key={l.id} data-testid={`sysinfo-light-${l.id}`} data-tone={l.tone}>
              <i className={`sy-dot ${l.tone}`} aria-hidden="true" />
              <div>
                <b>{h(`light.${l.id}.n`)}</b>
                <span className="a2-scd sy-t">{h(`light.${l.id}.${l.variant}`, l.vars)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="sy-grid">
        <section className="a2-sc" data-testid="sysinfo-found">
          <h2 className="a2-h3">{h('found.h')}</h2>
          {problems.length ? (
            <ul className="sy-list">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="a2-scd">{state.health ? h('found.none') : h('empty')}</p>
          )}
          {state.health?.at ? <p className="a2-scd">{h('found.when', { when: dateTime(state.health.at, view.locale, view.timeZone) })}</p> : null}
        </section>
        <section className="a2-sc" data-testid="sysinfo-alerts">
          <h2 className="a2-h3">{h('alerts.h')}</h2>
          <p className="a2-scd">{h('alerts.d')}</p>
          <div className="sy-links">
            <Link className="a2-btn" href="/admin/settings/telegram-approvals">
              {h('alerts.telegram')}
            </Link>
            <Link className="a2-btn" href="/admin/settings/system/backups">
              {h('alerts.backups')}
            </Link>
            <Link className="a2-btn" href="/admin/settings/system/go-live">
              {h('alerts.golive')}
            </Link>
          </div>
        </section>
      </div>
      </details>
    </div>
  );
}
