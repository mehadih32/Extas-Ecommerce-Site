// PR 6 — the worker process: `tsx src/main.ts`. In production it runs as the `worker` service of each blue/green colour
// (infra/stack/app.yml, started, health-checked and rolled back with the web app by infra/deploy/deploy.sh), from the
// release's migrate image, which holds the workspace sources. It reads only the server's environment:
//   DATABASE_URL       the database (through PgBouncer), like the web app
//   REDIS_QUEUE_URL    the Redis queue store (no eviction, AOF on the data disk; PR 6 server setup)
//   VAULT_MASTER_KEY   opens the vault, so the ERP connection gets its keys (none = the practice ERP)
//   GIT_SHA, EXTAS_COLOR   shown on the Server page
//   EXTAS_WORKER_HEALTH_FILE   where the heartbeat file for the container's health check goes (optional)
// SIGTERM / SIGINT stop it cleanly: running jobs finish, the leader lock is let go, the heartbeat row says "stopped".
import { allAdapters, createConnections } from '@extas/adapters';
import { getPrisma } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { createVault } from '@extas/vault';
import { errorLine, type JobDeps } from './context';
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
  const deps: JobDeps = { db, settings, inventory: { db, settings, connections } };
  const worker = await startWorker({
    deps,
    redisUrl,
    version: process.env.GIT_SHA?.slice(0, 12) || null,
    color: process.env.EXTAS_COLOR || null,
    healthFile: process.env.EXTAS_WORKER_HEALTH_FILE || null,
    // PR 196: verified ERP webhooks waiting to be applied
    planners: [webhookPlanner],
  });
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal}: stopping`);
    worker
      .stop()
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
