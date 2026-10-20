// Command line of the rules package:
//   tsx src/cli.ts sample      sample Smart Rules and notices for the sample store (dev, CI and the preview only)
// Connects straight to PostgreSQL (DATABASE_DIRECT_URL). Prints only keys and counts, never a connection string.
import { PrismaClient } from '@extas/db/client';
import { registry, type Key, type Value } from '@extas/settings';
import { RulesError } from './errors';
import { SampleRulesRefused, seedSampleRules } from './sample';

async function main(argv: string[]): Promise<number> {
  if (argv[0] !== 'sample') {
    console.error('usage: cli.ts sample');
    return 2;
  }
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('rules: DATABASE_DIRECT_URL is not set');
    return 1;
  }
  const db = new PrismaClient({ datasourceUrl: url });
  // The sample store runs on the registry defaults (it is made up; nothing of the owner's is read).
  const settings = { value: async <K extends Key>(key: K): Promise<Value<K>> => registry[key].default as Value<K> };
  try {
    const r = await seedSampleRules({ db, settings });
    console.log(`rules sample → store ${r.storeId}: ${r.rules} rule(s), ${r.notices} notice(s) created`);
    return 0;
  } catch (e) {
    if (e instanceof SampleRulesRefused || e instanceof RulesError) {
      console.error(`rules: ${e.message}`);
      return 1;
    }
    throw e;
  } finally {
    await db.$disconnect();
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code));
