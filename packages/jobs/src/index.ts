// @extas/jobs — S0A · PR 6 (CN-022), the background worker:
// - catalogue.ts   every job the worker knows (the S09 inventory jobs: stock pull, cart-hold expiry, ERP document
//                  relay, low-stock check, reconcile, default locations), each a small JSON payload and a function;
// - runs.ts        one JobRun row per attempt (status, tries, next attempt, failure reason) and the run-level
//                  idempotency guard, so a retried job never repeats a side effect;
// - backoff.ts     the wait before the next try (`jobs.retry.*`);
// - scheduler.ts   the timetable from the jobs' own settings, cut into slots: one run per job, store and slot;
// - leader.ts      the one scheduler leader (a Redis lock with renewal);
// - heartbeat.ts   each worker's heartbeat row;
// - status.ts      what the admin Server page shows (heartbeat fresh or stale, the leader, the failed jobs);
// - webhooks.ts    PR 196: the planner that puts stored ERP webhooks on the queue (worker.ts `planners`);
// - search.ts      PR 72: the search index job and the planner that runs it for a store whose index is behind;
// - messages.ts    PR 148: the message engine's run per store and slot (the order journey's SMS, WhatsApp, e-mail);
// - payments.ts    PR 170: the sweep of open online payments per store and slot (recovered or marked abandoned);
// - courier.ts     PR 176: the courier tracking read per store and slot (the parcels the couriers hold);
// - invoices.ts    PR 407: the invoice run per store and slot (every placed order's invoice, a new version on edit).
// This root has no queue client in it, so the web app can read the status. The worker itself (BullMQ, ioredis) is
// `@extas/jobs/worker` (worker.ts), started by `src/main.ts` as its own process (infra/stack/app.yml `worker`).
export * from './context';
export * from './backoff';
export * from './catalogue';
export * from './runs';
export * from './scheduler';
export * from './leader';
export * from './heartbeat';
export * from './status';
export * from './webhooks';
export * from './search';
export * from './messages';
export * from './payments';
export * from './courier';
export * from './invoices';
export * from './returns-erp';
