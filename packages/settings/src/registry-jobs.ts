// S0A · PR 6 (CN-022) — the background worker (@extas/jobs): how often it says it is alive and when the Server page
// calls it stale, the scheduler leader's lock, how often the leader looks at the timetable, how many jobs run at once,
// how long a job may run before another worker takes it over, how often and how far apart a failed job is tried again,
// how many finished jobs the queue keeps, and what the Server page lists. Every interval is here, never in code; how
// often each job itself runs stays with its own setting (e.g. `erp.sync.stockPollMinutes`, `erp.push.relaySeconds`).
// Labels: messages/jobs.<lang>.json. Registry version 22.
import { z } from 'zod';
import { setting } from './define';

const V = 22;

const base = { scope: 'installation', isOwnerData: false, group: 'system', version: V } as const;

export const jobsSettings = {
  'jobs.scheduler.enabled': setting({
    ...base,
    schema: z.boolean(),
    // The worker is part of the shop (stock pull, cart holds, ERP documents); off stops every scheduled job at once.
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'jobs.scheduler.enabled.label',
    helpKey: 'jobs.scheduler.enabled.help',
    sortOrder: 200,
  }),
  'jobs.scheduler.tickSeconds': setting({
    ...base,
    schema: z.int().min(1).max(300),
    default: 5,
    valueType: 'INT',
    labelKey: 'jobs.scheduler.tickSeconds.label',
    helpKey: 'jobs.scheduler.tickSeconds.help',
    sortOrder: 210,
  }),
  'jobs.leader.lockSeconds': setting({
    ...base,
    schema: z.int().min(5).max(600),
    default: 30,
    valueType: 'INT',
    labelKey: 'jobs.leader.lockSeconds.label',
    helpKey: 'jobs.leader.lockSeconds.help',
    sortOrder: 220,
  }),
  'jobs.heartbeat.everySeconds': setting({
    ...base,
    schema: z.int().min(1).max(300),
    default: 10,
    valueType: 'INT',
    labelKey: 'jobs.heartbeat.everySeconds.label',
    helpKey: 'jobs.heartbeat.everySeconds.help',
    sortOrder: 230,
  }),
  'jobs.heartbeat.staleSeconds': setting({
    ...base,
    schema: z.int().min(10).max(3600),
    default: 60,
    valueType: 'INT',
    labelKey: 'jobs.heartbeat.staleSeconds.label',
    helpKey: 'jobs.heartbeat.staleSeconds.help',
    sortOrder: 240,
  }),
  'jobs.concurrency': setting({
    ...base,
    schema: z.int().min(1).max(32),
    default: 2,
    valueType: 'INT',
    labelKey: 'jobs.concurrency.label',
    helpKey: 'jobs.concurrency.help',
    sortOrder: 250,
  }),
  'jobs.lockSeconds': setting({
    ...base,
    schema: z.int().min(5).max(3600),
    default: 60,
    valueType: 'INT',
    labelKey: 'jobs.lockSeconds.label',
    helpKey: 'jobs.lockSeconds.help',
    sortOrder: 260,
  }),
  // R1 ops review (M10): a job that never returns (an outside call with no timeout of its own) held a worker slot for
  // good while its lock and the heartbeat stayed fresh. After this long the attempt fails and is tried again; 0 = no
  // limit. Registry version 86.
  'jobs.attemptTimeoutSeconds': setting({
    ...base,
    version: 86,
    schema: z.int().min(0).max(86_400),
    default: 1800,
    valueType: 'INT',
    labelKey: 'jobs.attemptTimeoutSeconds.label',
    helpKey: 'jobs.attemptTimeoutSeconds.help',
    sortOrder: 265,
  }),
  'jobs.retry.maxAttempts': setting({
    ...base,
    schema: z.int().min(1).max(20),
    default: 5,
    valueType: 'INT',
    labelKey: 'jobs.retry.maxAttempts.label',
    helpKey: 'jobs.retry.maxAttempts.help',
    sortOrder: 270,
  }),
  'jobs.retry.backoffBaseSeconds': setting({
    ...base,
    schema: z.int().min(1).max(3600),
    default: 30,
    valueType: 'INT',
    labelKey: 'jobs.retry.backoffBaseSeconds.label',
    helpKey: 'jobs.retry.backoffBaseSeconds.help',
    sortOrder: 280,
  }),
  'jobs.retry.backoffMaxSeconds': setting({
    ...base,
    schema: z.int().min(1).max(86_400),
    default: 1800,
    valueType: 'INT',
    labelKey: 'jobs.retry.backoffMaxSeconds.label',
    helpKey: 'jobs.retry.backoffMaxSeconds.help',
    sortOrder: 290,
  }),
  'jobs.queue.keepCompleted': setting({
    ...base,
    schema: z.int().min(0).max(100_000),
    default: 1000,
    valueType: 'INT',
    labelKey: 'jobs.queue.keepCompleted.label',
    helpKey: 'jobs.queue.keepCompleted.help',
    sortOrder: 300,
  }),
  'jobs.queue.keepFailed': setting({
    ...base,
    schema: z.int().min(0).max(100_000),
    default: 5000,
    valueType: 'INT',
    labelKey: 'jobs.queue.keepFailed.label',
    helpKey: 'jobs.queue.keepFailed.help',
    sortOrder: 310,
  }),
  'jobs.serverPage.failedHours': setting({
    ...base,
    schema: z.int().min(1).max(24 * 90),
    default: 72,
    valueType: 'INT',
    labelKey: 'jobs.serverPage.failedHours.label',
    helpKey: 'jobs.serverPage.failedHours.help',
    sortOrder: 320,
  }),
  'jobs.serverPage.failedLimit': setting({
    ...base,
    schema: z.int().min(1).max(200),
    default: 20,
    valueType: 'INT',
    labelKey: 'jobs.serverPage.failedLimit.label',
    helpKey: 'jobs.serverPage.failedLimit.help',
    sortOrder: 330,
  }),
};
