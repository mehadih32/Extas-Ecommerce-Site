// PR 791 — Settings › Site health and Updates & versions (prototype v5 m-settings.js `renderHealth`, `renderUpdates`), built
// from what the server already writes (lib/status.ts `runtimeState`: the last good deploy, the server's own health check,
// the nightly page check, the backups, the restore drill, the origin certificate). Nothing is invented: a light with no data
// says "Not reported yet". Pure: no React, no database, no clock of its own (`now` is passed in).
import type { RuntimeState } from '@/lib/status';

export type Tone = 'ok' | 'warn' | 'bad' | 'off';

export interface Light {
  id: 'up' | 'nightly' | 'backup' | 'drill' | 'ssl' | 'build';
  tone: Tone;
  /** `sysinfo.light.<id>.<variant>` says it; `vars` fill the words. */
  variant: string;
  vars: Record<string, string | number>;
}

const HOUR = 36e5;
/** How old the server's own check, the nightly page check and a backup may be before the light turns yellow (hours). */
export const FRESH_HOURS = { health: 2, nightly: 36, backup: 36 } as const; // hardcode-ok: the go-live list's own freshness limits (lib/go-live.ts)
/** The certificate turns yellow with this many days left. */
export const SSL_WARN_DAYS = 14; // hardcode-ok: the usual renewal margin

const age = (iso: string | undefined, now: Date): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now.getTime() - t) / HOUR : null;
};

/** The six lights of the Site health page, from what the server wrote. */
export function lights(state: RuntimeState, now: Date, build: string): Light[] {
  const out: Light[] = [];
  const h = state.health;
  const hAge = age(h?.at, now);
  if (!h || hAge === null) out.push({ id: 'up', tone: 'off', variant: 'none', vars: {} });
  else if (h.problems && h.problems.length) out.push({ id: 'up', tone: 'bad', variant: 'problems', vars: { n: h.problems.length } });
  else if (hAge > FRESH_HOURS.health) out.push({ id: 'up', tone: 'warn', variant: 'stale', vars: { hours: Math.floor(hAge) } });
  else out.push({ id: 'up', tone: 'ok', variant: 'ok', vars: {} });

  const s = state.smoke;
  const sAge = age(s?.at, now);
  if (!s || sAge === null) out.push({ id: 'nightly', tone: 'off', variant: 'none', vars: {} });
  else if (s.ok === false || (s.failed ?? 0) > 0) out.push({ id: 'nightly', tone: 'bad', variant: 'failed', vars: { pages: s.pages ?? 0, failed: s.failed ?? 0 } });
  else if (sAge > FRESH_HOURS.nightly) out.push({ id: 'nightly', tone: 'warn', variant: 'stale', vars: { hours: Math.floor(sAge) } });
  else out.push({ id: 'nightly', tone: 'ok', variant: 'ok', vars: { pages: s.pages ?? 0 } });

  const b = state.backups.local;
  const bAge = age(b?.at, now);
  if (!b || !b.result || b.result === 'off') out.push({ id: 'backup', tone: 'off', variant: 'none', vars: {} });
  else if (b.result === 'fail') out.push({ id: 'backup', tone: 'bad', variant: 'failed', vars: {} });
  else if (bAge !== null && bAge > FRESH_HOURS.backup) out.push({ id: 'backup', tone: 'warn', variant: 'stale', vars: { hours: Math.floor(bAge) } });
  else out.push({ id: 'backup', tone: 'ok', variant: 'ok', vars: {} });

  const d = state.drill;
  if (!d || !d.result) out.push({ id: 'drill', tone: 'off', variant: 'none', vars: {} });
  else out.push({ id: 'drill', tone: d.result === 'ok' ? 'ok' : 'bad', variant: d.result === 'ok' ? 'ok' : 'failed', vars: {} });

  const c = state.originCert;
  if (!c || c.daysLeft === null || c.daysLeft === undefined) out.push({ id: 'ssl', tone: 'off', variant: 'none', vars: {} });
  else if (c.daysLeft < 0) out.push({ id: 'ssl', tone: 'bad', variant: 'expired', vars: {} });
  else out.push({ id: 'ssl', tone: c.daysLeft <= SSL_WARN_DAYS ? 'warn' : 'ok', variant: 'days', vars: { n: c.daysLeft } });

  out.push({ id: 'build', tone: build === 'dev' ? 'off' : 'ok', variant: build === 'dev' ? 'dev' : 'ok', vars: { build } });
  return out;
}

/** "all green" when no light is yellow or red (lights with no data do not count against it). */
export const allGreen = (ls: readonly Light[]): boolean => ls.every((l) => l.tone === 'ok' || l.tone === 'off');
