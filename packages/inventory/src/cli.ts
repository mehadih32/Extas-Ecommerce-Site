// Command line of the inventory package:
//   tsx src/cli.ts sample-v6   the sample store on ERP contract v6 (CI and dev only; src/sample-v6.ts, PR 621)
// Connects straight to PostgreSQL (DATABASE_DIRECT_URL). Prints only ids and counts, never a connection string.
import { allAdapters, createConnections } from '@extas/adapters';
import { PrismaClient } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver, storeTarget } from '@extas/settings';
import { SampleErpV6Refused, seedSampleErpV6 } from './sample-v6';

async function main(argv: string[]): Promise<number> {
  if (argv[0] !== 'sample-v6') {
    console.error('usage: cli.ts sample-v6');
    return 2;
  }
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('inventory: DATABASE_DIRECT_URL is not set');
    return 1;
  }
  const db = new PrismaClient({ datasourceUrl: url });
  const settings = new SettingsResolver(prismaBackend(db), registry, {});
  // the sample store's ERP is the practice one: no key is read from any vault
  const connections = createConnections({ db, vault: { get: async () => null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
  try {
    const r = await seedSampleErpV6(
      { db, settings, connections, now: () => new Date(), sleep: (ms) => new Promise((done) => setTimeout(done, ms)), random: Math.random },
      { setStoreSetting: async (key, value, storeId) => void (await settings.set(key, value, storeTarget(storeId), { actorId: null, reason: 'sample store on ERP contract v6 (CI and dev only)', ownerApproved: true })) },
    );
    console.log(r.created ? `inventory sample-v6 → store ${r.storeId}: link ${r.linkId}, ${r.days} day close(s), on hold` : `inventory sample-v6 → store ${r.storeId} is there already; nothing written`);
    return 0;
  } catch (e) {
    if (e instanceof SampleErpV6Refused) {
      console.error(`inventory: ${e.message}`);
      return 1;
    }
    throw e;
  } finally {
    await db.$disconnect();
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code));
