// Command line of the settings package, run by the deploy (`migrate` image) right after `prisma migrate deploy`:
//   tsx src/cli.ts sync      make SettingDefinition match the registry (PR 496); safe to run any number of times
// It connects straight to PostgreSQL (DATABASE_DIRECT_URL), like the schema migrations. It never prints a connection
// string, a password or a setting value — only keys and counts.
import { PrismaClient } from '@extas/db/client';
import { messages } from './messages';
import { registry } from './registry';
import { describeSync, syncSettings } from './sync';

async function main(argv: string[]): Promise<number> {
  const [command] = argv;
  if (command !== 'sync') {
    console.error('usage: cli.ts sync');
    return 2;
  }
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('settings sync: DATABASE_DIRECT_URL is not set');
    return 1;
  }
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const report = await syncSettings(prisma, { registry, messages, appVersion: process.env.GIT_SHA || null });
    for (const line of describeSync(report)) console.log(line);
    return 0;
  } catch (error) {
    // Prisma errors name the host at most, never the password; the message is still trimmed to one line.
    console.error(`settings sync: FAILED — ${String(error instanceof Error ? error.message : error).split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown error'}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = await main(process.argv.slice(2));
