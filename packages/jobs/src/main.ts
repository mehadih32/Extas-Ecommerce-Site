// PR 6 — the worker process: `tsx src/main.ts`. In production it runs as the `worker` service of each blue/green colour
// (infra/stack/app.yml, started, health-checked and rolled back with the web app by infra/deploy/deploy.sh), from the
// release's migrate image, which holds the workspace sources. It reads only the server's environment:
//   DATABASE_URL       the database (through PgBouncer), like the web app
//   REDIS_QUEUE_URL    the Redis queue store (no eviction, AOF on the data disk; PR 6 server setup)
//   VAULT_MASTER_KEY   opens the vault, so the ERP connection gets its keys (none = the practice ERP)
//   REDIS_CACHE_URL    PR 602: the cache store — the worker's own changes (the ERP's stock) clear the web app's pages
//                      (none = the pages' short lifetimes bound what the web app still shows)
//   MEILI_URL, MEILI_MASTER_KEY   the server's Meilisearch (PR 72; none = no search index job, the shop searches PostgreSQL)
//   GIT_SHA, EXTAS_COLOR   shown on the Server page
//   EXTAS_WORKER_HEALTH_FILE   where the heartbeat file for the container's health check goes (optional)
// SIGTERM / SIGINT stop it cleanly: running jobs finish, the leader lock is let go, the heartbeat row says "stopped".
import { hostname } from 'node:os';
import { allAdapters, courierAdapters, createConnections, messageAdapters, paymentAdapters, type CdnPurger } from '@extas/adapters';
import { createCacheRuntime, dayIn, SHOP_PATHS } from '@extas/cache';
import { connectionGateways } from '@extas/payments';
import { getPrisma } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { createVault } from '@extas/vault';
import { sendersFrom } from '@extas/messages';
import { meiliFromEnv } from '@extas/search';
import { errorLine, type JobDeps } from './context';
import { courierPlanner, courierZonesPlanner } from './courier';
import { messagesPlanner } from './messages';
import { piiPlanner } from './pii';
import { paymentsPlanner } from './payments';
import { searchPlanner } from './search';
import { webhookPlanner } from './webhooks';
import { startWorker } from './worker';

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_QUEUE_URL;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!redisUrl) throw new Error('REDIS_QUEUE_URL is not set');
  const db = getPrisma();
  const settings = new SettingsResolver(prismaBackend(db), registry, { onStale: (e) => console.warn(`[worker] settings: serving the last values (${errorLine(e)})`) });
  const key = process.env.VAULT_MASTER_KEY;
  const vault = key && key.length >= 32 ? createVault(db, key) : { get: async () => null };
  const [testS, cacheS] = await Promise.all([settings.value('system.integrationTestTimeoutSeconds'), settings.value('system.integrationKeyCacheSeconds')]);
  const connections = createConnections({ db, vault, adapters: allAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  // PR 148: the message senders have their own connection layer (each the mock until the owner enters its key)
  const senders = createConnections({ db, vault, adapters: messageAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  // PR 176: the couriers too (the practice courier and each real one, its practice world until the owner's keys pass)
  const couriers = createConnections({ db, vault, adapters: courierAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  // PR 170: the payment gateways (each the practice gateway until the owner's keys pass the Test button)
  const gateways = createConnections({ db, vault, adapters: paymentAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  const deps: JobDeps = {
    db,
    settings,
    inventory: { db, settings, connections },
    search: { meili: meiliFromEnv() },
    messages: { sender: sendersFrom(senders) },
    payments: { gateways: connectionGateways(gateways) },
    couriers: { connections: couriers },
  };
  // PR 602: a change the worker makes (the ERP's stock, a price) is cleared from every web process's page cache over
  // Redis and, while Cloudflare keeps pages, at Cloudflare (the mock until the owner's token passes its test)
  const cache = createCacheRuntime({
    db,
    settings,
    cdn: async () => {
      const c = await connections.use<CdnPurger>('CDN');
      return { api: c.api, provider: c.provider, mode: c.mode };
    },
    redisUrl: process.env.REDIS_CACHE_URL || null,
    origin: `worker-${hostname()}-${process.env.EXTAS_COLOR ?? 'dev'}-${process.pid}`,
    paths: SHOP_PATHS,
    day: () => dayIn(process.env.EXTAS_TIMEZONE || 'UTC'),
  });
  const stopCache = await cache.start();
  const worker = await startWorker({
    deps,
    redisUrl,
    version: process.env.GIT_SHA?.slice(0, 12) || null,
    color: process.env.EXTAS_COLOR || null,
    healthFile: process.env.EXTAS_WORKER_HEALTH_FILE || null,
    // PR 196: verified ERP webhooks waiting to be applied; PR 72: a store whose search index is behind its catalogue;
    // PR 148: each store's message run per slot; PR 159: each store's purge of kept IP, device and location; PR 170:
    // each store's sweep of open online payments per slot; PR 176: each store's courier tracking read per slot
    planners: [webhookPlanner, searchPlanner, messagesPlanner, piiPlanner, paymentsPlanner, courierPlanner, courierZonesPlanner],
  });
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal}: stopping`);
    worker
      .stop()
      .then(() => stopCache())
      .then(() => db.$disconnect())
      .then(
        () => process.exit(0),
        (e) => {
          console.error(`[worker] stop failed: ${errorLine(e)}`);
          process.exit(1);
        },
      );
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  // The first plan right away, not one tick later.
  await worker.tick();
}

main().catch((e) => {
  console.error(`[worker] could not start: ${errorLine(e)}`);
  process.exit(1);
});
