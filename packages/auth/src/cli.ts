// Command line of the auth package. Connects straight to PostgreSQL (DATABASE_DIRECT_URL), like the migrations.
//   tsx src/cli.ts sync
//       permission catalogue + owner role (run by every deploy after the settings sync); safe to run again
//   tsx src/cli.ts create-owner --email <e-mail> --name <name>                 password read from standard input
//   tsx src/cli.ts create-owner --email <e-mail> --name <name> --generate-to <file>
//       a random first password is written to <file> (mode 0600, the file must not exist) and must be changed at the
//       first login
// It never prints a connection string, a password or a hash.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { AuthError } from './errors';
import { createFirstOwner } from './owner';
import { securityPolicy } from './policy';
import { describeAuthSync, syncAuth } from './sync';

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0] ?? '';
}

const oneLine = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown error';

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== 'sync' && command !== 'create-owner') {
    console.error('usage: cli.ts sync | create-owner --email <e-mail> --name <name> [--generate-to <file>]');
    return 2;
  }
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error(`auth ${command}: DATABASE_DIRECT_URL is not set`);
    return 1;
  }
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    if (command === 'sync') {
      for (const line of describeAuthSync(await syncAuth(prisma))) console.log(line);
      return 0;
    }
    const email = arg(rest, '--email');
    const name = arg(rest, '--name');
    const generateTo = arg(rest, '--generate-to');
    if (!email || !name) {
      console.error('auth create-owner: --email and --name are required');
      return 2;
    }
    const policy = await securityPolicy(new SettingsResolver(prismaBackend(prisma), registry));
    const password = generateTo ? randomBytes(18).toString('base64url') : await readStdin();
    if (generateTo) writeFileSync(generateTo, `${password}\n`, { mode: 0o600, flag: 'wx' });
    await syncAuth(prisma);
    const staff = await createFirstOwner(prisma, policy, { email, displayName: name, password, passwordChosenByOwner: !generateTo });
    console.log(`auth create-owner: owner account ${staff.id} created${generateTo ? ' (first password in the file given; change it at the first login)' : ''}`);
    return 0;
  } catch (error) {
    const details = error instanceof AuthError && error.details.length ? ` (${error.details.join(', ')})` : '';
    console.error(`auth ${command}: FAILED — ${oneLine(error)}${details}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = await main(process.argv.slice(2));
