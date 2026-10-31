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
import { z } from 'zod';
import { setting } from './define';

const V = 81;

export const healthHubSchema = z
  .object({
    monitorStaleMinutes: z.int().min(2).max(120),
    siteSlowMs: z.int().min(200).max(20_000),
    smokeStaleHours: z.int().min(1).max(168),
  })
  .strict();
export type HealthHubSettings = z.output<typeof healthHubSchema>;

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
};
