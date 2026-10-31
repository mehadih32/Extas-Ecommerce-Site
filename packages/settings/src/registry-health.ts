// S21 · PR 413 (REP-07, docs/BACKEND-ARCHITECTURE.md) — the Site health hub (registry version 81; lane B's reserved run,
// CN-031). Labels: messages/health.<lang>.json (group `system`; the admin's place is Reports → Site health). The hub
// shows one status line each for customer problems, the server, speed, the site audit and the smoke test; these are
// the times and the speed after which a line turns from green to yellow. Nothing here changes what the server does:
// it only decides how a line is judged.
//
// - `health.hub.monitorStaleMinutes`: the server's health check (extas-monitor, every minute) is "late" after this.
// - `health.hub.siteSlowMs`: the home page answering slower than this marks speed yellow (the monitor alerts by its
//   own MONITOR_SLOW_MS in server.conf; the same default).
// - `health.hub.smokeStaleHours`: the smoke test runs after every deploy and every night; older than this, it is late.
//
// PR 414 (B7.3, registry version 82): `health.journeys`, when the saved browser journeys run (docs/qa/journeys.json,
// tools/journeys.mjs; a customer, the admin, an accountant and the warehouse on a phone and a desktop screen). Off as
// it ships; the server's hourly check (journeys.yml, infra/deploy/journeys.sh) reads it through extas-vault-sync
// (journeys-settings.env) and starts a run when one is due.
// - `enabled`: the schedule on or off (off = only when someone presses "Run now").
// - `every`: hourly, daily (at `hour`) or weekly (on `weekday`, 1 Monday … 7 Sunday, at `hour`), the server's time zone.
// - `keepRuns`: how many runs the server keeps for comparison.
// - `runRequestedAt`: set by "Run now" (the time it was pressed); the next hourly check runs once when it is newer than
//   the last run. Never typed in by hand.
import { z } from 'zod';
import { setting } from './define';

const V = 81;
const V414 = 82;

export const healthHubSchema = z
  .object({
    monitorStaleMinutes: z.int().min(2).max(120),
    siteSlowMs: z.int().min(200).max(20_000),
    smokeStaleHours: z.int().min(1).max(168),
  })
  .strict();
export type HealthHubSettings = z.output<typeof healthHubSchema>;

export const JOURNEY_EVERY = ['hourly', 'daily', 'weekly'] as const;
export const healthJourneysSchema = z
  .object({
    enabled: z.boolean(),
    every: z.enum(JOURNEY_EVERY),
    hour: z.int().min(0).max(23),
    weekday: z.int().min(1).max(7),
    keepRuns: z.int().min(1).max(200),
    runRequestedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type HealthJourneysSettings = z.output<typeof healthJourneysSchema>;

export const healthSettings = {
  'health.hub': setting({
    scope: 'installation',
    schema: healthHubSchema,
    default: { monitorStaleMinutes: 5, siteSlowMs: 2000, smokeStaleHours: 30 },
    valueType: 'JSON',
    group: 'system',
    labelKey: 'health.hub.label',
    helpKey: 'health.hub.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 950,
    version: V,
  }),
  'health.journeys': setting({
    scope: 'installation',
    schema: healthJourneysSchema,
    default: { enabled: false, every: 'daily', hour: 6, weekday: 5, keepRuns: 30, runRequestedAt: null },
    valueType: 'JSON',
    group: 'system',
    labelKey: 'health.journeys.label',
    helpKey: 'health.journeys.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 951,
    version: V414,
  }),
};
