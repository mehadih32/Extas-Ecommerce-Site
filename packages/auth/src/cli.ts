// Command line of the auth package. Connects straight to PostgreSQL (DATABASE_DIRECT_URL), like the migrations.
//   tsx src/cli.ts sync
//       permission catalogue + owner role (run by every deploy after the settings sync); safe to run again
//   tsx src/cli.ts create-owner --email <e-mail> --name <name>                 password read from standard input
//   tsx src/cli.ts create-owner --email <e-mail> --name <name> --generate-to <file>
//       a random first password is written to <file> (mode 0600, the file must not exist) and must be changed at the
//       first login
//   tsx src/cli.ts reset-owner --write-to <file>
//       the owner can no longer sign in: a new random first password for the one active owner (changed at the next
//       sign-in), his sessions ended, a wrong-try wait lifted; <file> (mode 0600, must not exist) gets OWNER_EMAIL and
//       OWNER_FIRST_PASSWORD; prints why recent sign-ins failed (counts only)
//   tsx src/cli.ts check-account --email <e-mail> --name <name> --write-to <file>
//       CN-016: the smoke test's read-only account with a fresh password and two-step seed, written to <file>
//       (mode 0600, replaced) as SMOKE_EMAIL / SMOKE_PASSWORD / SMOKE_TOTP_SECRET lines; needs VAULT_MASTER_KEY
// It never prints a connection string, a password or a hash.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@extas/db/client';
import { createVault } from '@extas/vault';
import { ensureCheckAccount } from './check-account';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { AuthError } from './errors';
import { createFirstOwner } from './owner';
import { describeFindings, resetOwnerPassword } from './owner-reset';
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
  if (command !== 'sync' && command !== 'create-owner' && command !== 'reset-owner' && command !== 'check-account') {
    console.error('usage: cli.ts sync | create-owner --email <e-mail> --name <name> [--generate-to <file>] | reset-owner --write-to <file> | check-account --email <e-mail> --name <name> --write-to <file>');
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
    if (command === 'reset-owner') {
      const writeTo = arg(rest, '--write-to');
      if (!writeTo) {
        console.error('auth reset-owner: --write-to is required');
        return 2;
      }
      await syncAuth(prisma);
      const policy = await securityPolicy(new SettingsResolver(prismaBackend(prisma), registry));
      writeFileSync(writeTo, '', { mode: 0o600, flag: 'wx' }); // the file must be writable before anything changes
      const r = await resetOwnerPassword(prisma, policy);
      writeFileSync(writeTo, `OWNER_EMAIL=${r.email}\nOWNER_FIRST_PASSWORD=${r.password}\n`, { mode: 0o600 });
      for (const line of describeFindings(r.findings)) console.log(`auth reset-owner: ${line}`);
      console.log(`auth reset-owner: owner account ${r.staffUserId} has a new first password (in the file given; change it at the next sign-in)`);
      return 0;
    }
    if (command === 'check-account') return await checkAccount(prisma, rest);
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

async function checkAccount(prisma: PrismaClient, rest: string[]): Promise<number> {
  const email = arg(rest, '--email');
  const name = arg(rest, '--name');
  const writeTo = arg(rest, '--write-to');
  if (!email || !name || !writeTo) {
    console.error('auth check-account: --email, --name and --write-to are required');
    return 2;
  }
  const key = process.env.VAULT_MASTER_KEY;
  if (!key || key.length < 32) {
    console.error('auth check-account: VAULT_MASTER_KEY is not set (the two-step seed is sealed by the vault)');
    return 1;
  }
  await syncAuth(prisma);
  const r = await ensureCheckAccount(prisma, createVault(prisma, key), { email, displayName: name });
  writeFileSync(writeTo, `SMOKE_EMAIL=${email}\nSMOKE_PASSWORD=${r.password}\nSMOKE_TOTP_SECRET=${r.totpSecret}\n`, { mode: 0o600 });
  console.log(`auth check-account: ${r.created ? 'made' : 'renewed'} (password and two-step seed in the file given)`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
