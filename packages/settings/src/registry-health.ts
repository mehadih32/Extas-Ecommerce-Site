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
//
// PR 423 (CN-015, registry version 83): `health.problems`, the privacy-safe problem recorder on the shop's pages
// (Reports › Site health › Customer problems). On as it ships, as the owner asked (CN-015 (1): found automatically from
// real visits); it never records a name, phone, address or payment detail, and visitor ids are random per browser tab.
// - `enabled`: the shop's pages report what goes wrong (off: nothing is sent or kept).
// - `slowRequestMs` / `slowLoadMs`: a call to the shop's own server, or a page load, slower than this is recorded.
// - `rageClicks`: this many clicks within a second on one spot count as a "rage" click.
// - `formErrorRepeats`: the same form field refused this many times on one page is a stuck form.
// - `maxPerPage`: the most reports one page view sends (a broken page cannot flood the server).
// - `urgentVisitors`: a problem that hit this many visitors in a day is Urgent wherever it is (on the bag, checkout or
//   payment pages one is enough).
// - `showDays`: the lists count and show the last this many days.
// - `glitchMinutes`: a problem seen only within this many minutes, and not since, is a "short glitch".
//
// PR 415 (CN-015, registry version 110): `health.alerts`, a Telegram line to the owner when a customer problem needs
// him now. Off as it ships (CN-013: a new optional feature starts off); the owner's bot is the one on Keys &
// connections (PR 392), the practice copy until it is connected.
// - `enabled`: the alerts on or off.
// - `onUrgent`: a line when a problem becomes Urgent (new, or judged Urgent after more visitors).
// - `spikeVisitors` / `spikeMinutes`: a line when one problem hit this many visitors within these minutes.
// - `repeatHours`: at most one line per problem within these hours, however often it happens.
//
// PR 416 (B7.3, registry version 111): `health.uiChecks`, UI checks at the phone and desktop widths of the saved
// journeys' runs (tools/journeys.mjs, the device gate's own measures). Off as it ships; synced to the server as
// JOURNEYS_UI in journeys-settings.env. Each switch is one family of findings:
// - `layout`: wider than the screen, sideways scrolling, something sticking out, a squeezed tab label.
// - `text`: text cut off, form text under 16 px on the phone.
// - `images`: a picture that did not load.
// - `taps`: a button too small on the phone, two on top of each other, or one covered by something else.
//
// PR 417 (§5 REP-07c, registry version 112): `health.speed`, Reports › Site health › Speed. The targets stay in
// `seo.vitals` (Website › SEO); this holds only the page's own numbers.
// - `months`: how many months the monthly table shows (real visitors' 75th percentile, and the lab run of that month).
// - `runRequestedAt`: set by "Measure now" (the time it was pressed); the server's hourly check (vitals-monthly.yml,
//   infra/deploy/vitals-lab.sh asked) measures once when it is newer than the last lab run. Never typed in by hand.
//
// PR 420 (B7.3, registry version 113): `health.fixGate`, the approval gate for agent auto-fixes and new skills
// (Reports › Site health › Fixes to approve). A proposal waits for the owner; nothing is fixed or switched on without
// his OK. Off as it ships:
// - `proposals`: agents (and the audit runner) may file fix proposals and new skills at all. Off: every proposal is
//   refused and nothing waits. Approving is always a person's step; there is no automatic approval.
// - `expireDays`: a proposal nobody decided within these days expires (it can be filed again); 0 = never.
//
// PR 424 (B7.3, registry version 114): `health.runAlerts`, a Telegram line to the owner when the smoke test or the
// saved journeys fail (Reports › Site health › Run history). Off as it ships; synced to the server as run-alerts.env,
// read by run_alert in infra/deploy/smoke-lib.sh right after each run. The owner's bot is the one on Keys &
// connections (PR 392); until it is connected every line is only written to the server's alert log.
// - `enabled`: the lines on or off.
// - `smoke` / `journeys`: which test's failures send a line.
// - `repeatHours`: while a test keeps failing, the line comes again at most once within these hours.
// - `recovered`: one line when a test that was said to fail passes again.
//
// PR 570 (B7.3 · Note 14/21, registry version 115): `health.audit`, the checklist audit runner (AI › Checklist audit).
// Off as it ships; synced to the server as audit-settings.env; the server's hourly check (audit.yml,
// infra/deploy/audit.sh) runs an audit when one is due: the smoke test and the saved journeys with every UI check, then
// a report per checklist group (tools/audit-report.mjs). Fixes only through Fixes to approve (PR 420).
// - `enabled` / `every` / `weekday` / `hour`: the schedule (daily or weekly, the server's time zone); off = only when
//   someone presses "Run now".
// - `groups`: the checklist groups to audit (empty = all).
// - `agents`: how many audit agents judge the points no script covers (1-3; a mock until the AI key is in the vault).
// - `telegram`: the report and the problem list go to the owner's Telegram (the bot on Keys & connections).
// - `keepRuns`: how many audits the server keeps for comparison.
// - `runRequestedAt`: set by "Run now"; never typed in by hand.
import { z } from 'zod';
import { setting } from './define';

const V = 81;
const V414 = 82;
const V423 = 83;
const V415 = 110;
const V416 = 111;
const V417 = 112;
const V420 = 113;
const V424 = 114;
const V570 = 115;

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

export const healthProblemsSchema = z
  .object({
    enabled: z.boolean(),
    slowRequestMs: z.int().min(500).max(60_000),
    slowLoadMs: z.int().min(1_000).max(60_000),
    rageClicks: z.int().min(3).max(10),
    formErrorRepeats: z.int().min(2).max(10),
    maxPerPage: z.int().min(1).max(50),
    urgentVisitors: z.int().min(1).max(1_000),
    showDays: z.int().min(1).max(365),
    glitchMinutes: z.int().min(1).max(1_440),
  })
  .strict();
export type HealthProblemsSettings = z.output<typeof healthProblemsSchema>;

export const healthAlertsSchema = z
  .object({
    enabled: z.boolean(),
    onUrgent: z.boolean(),
    spikeVisitors: z.int().min(2).max(10_000),
    spikeMinutes: z.int().min(5).max(1_440),
    repeatHours: z.int().min(1).max(168),
  })
  .strict();
export type HealthAlertsSettings = z.output<typeof healthAlertsSchema>;

export const healthUiChecksSchema = z
  .object({
    enabled: z.boolean(),
    layout: z.boolean(),
    text: z.boolean(),
    images: z.boolean(),
    taps: z.boolean(),
  })
  .strict();
export type HealthUiChecksSettings = z.output<typeof healthUiChecksSchema>;
export const healthSpeedSchema = z
  .object({
    months: z.int().min(1).max(36),
    runRequestedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type HealthSpeedSettings = z.output<typeof healthSpeedSchema>;
export const healthFixGateSchema = z
  .object({
    proposals: z.boolean(),
    expireDays: z.int().min(0).max(90),
  })
  .strict();
export type HealthFixGateSettings = z.output<typeof healthFixGateSchema>;
export const healthRunAlertsSchema = z
  .object({
    enabled: z.boolean(),
    smoke: z.boolean(),
    journeys: z.boolean(),
    repeatHours: z.int().min(1).max(168),
    recovered: z.boolean(),
  })
  .strict();
export type HealthRunAlertsSettings = z.output<typeof healthRunAlertsSchema>;
/** PR 570: a checklist group's id (its section number, or `timing` for L32/L33). */
export const AUDIT_GROUP_ID = /^(\d{1,2}|timing)$/;
export const healthAuditSchema = z
  .object({
    enabled: z.boolean(),
    every: z.enum(['daily', 'weekly']),
    weekday: z.int().min(1).max(7),
    hour: z.int().min(0).max(23),
    groups: z.array(z.string().regex(AUDIT_GROUP_ID)).max(40),
    agents: z.int().min(1).max(3),
    telegram: z.boolean(),
    keepRuns: z.int().min(1).max(52),
    runRequestedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type HealthAuditSettings = z.output<typeof healthAuditSchema>;

/** PR 416: the families of UI checks, in the order the server file lists them. */
export const UI_CHECK_FAMILIES = ['layout', 'text', 'images', 'taps'] as const;

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
  'health.problems': setting({
    scope: 'store',
    schema: healthProblemsSchema,
    default: { enabled: true, slowRequestMs: 4_000, slowLoadMs: 8_000, rageClicks: 4, formErrorRepeats: 3, maxPerPage: 10, urgentVisitors: 5, showDays: 30, glitchMinutes: 10 },
    valueType: 'JSON',
    group: 'system',
    labelKey: 'health.problems.label',
    helpKey: 'health.problems.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 952,
    version: V423,
  }),
  'health.alerts': setting({
    scope: 'store',
    schema: healthAlertsSchema,
    default: { enabled: false, onUrgent: true, spikeVisitors: 10, spikeMinutes: 60, repeatHours: 6 },
    valueType: 'JSON',
    group: 'system',
    labelKey: 'health.alerts.label',
    helpKey: 'health.alerts.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 953,
    version: V415,
  }),
  'health.uiChecks': setting({
    scope: 'installation',
    schema: healthUiChecksSchema,
    default: { enabled: false, layout: true, text: true, images: true, taps: true },
    valueType: 'JSON',
    group: 'system',
    labelKey: 'health.uiChecks.label',
    helpKey: 'health.uiChecks.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 954,
    version: V416,
  }),
  'health.speed': setting({
    scope: 'installation',
    schema: healthSpeedSchema,
    default: { months: 12, runRequestedAt: null },
    valueType: 'JSON',
    group: 'system',
    labelKey: 'health.speed.label',
    helpKey: 'health.speed.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 955,
    version: V417,
  }),
  'health.fixGate': setting({
    scope: 'installation',
    schema: healthFixGateSchema,
    default: { proposals: false, expireDays: 0 },
    valueType: 'JSON',
    group: 'system',
    labelKey: 'health.fixGate.label',
    helpKey: 'health.fixGate.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 956,
    version: V420,
  }),
  'health.runAlerts': setting({
    scope: 'installation',
    schema: healthRunAlertsSchema,
    default: { enabled: false, smoke: true, journeys: true, repeatHours: 24, recovered: true },
    valueType: 'JSON',
    group: 'system',
    labelKey: 'health.runAlerts.label',
    helpKey: 'health.runAlerts.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 957,
    version: V424,
  }),
  'health.audit': setting({
    scope: 'installation',
    schema: healthAuditSchema,
    default: { enabled: false, every: 'weekly', weekday: 1, hour: 3, groups: [], agents: 2, telegram: true, keepRuns: 12, runRequestedAt: null },
    valueType: 'JSON',
    group: 'system',
    labelKey: 'health.audit.label',
    helpKey: 'health.audit.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 958,
    version: V570,
  }),
};
