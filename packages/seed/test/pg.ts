// A throwaway PostgreSQL database for the database tests: created, migrated with the real migrations (0001_init …),
// and dropped afterwards. Needs TEST_DATABASE_ADMIN_URL — a connection to any database on a server where the user may
// CREATE DATABASE (CI: the db job's service; locally: the extas-postgres container). Without it the tests are skipped.
// Connection strings are never printed.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@extas/db/client';

export const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL || '';
export const HAS_DB = ADMIN_URL !== '';

const DB_DIR = fileURLToPath(new URL('../../db/', import.meta.url));

export interface TestDatabase {
  url: string;
  prisma: PrismaClient;
  drop(): Promise<void>;
}

export async function createTestDatabase(label: string): Promise<TestDatabase> {
  const name = `seed_test_${label}_${randomBytes(4).toString('hex')}`;
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const u = new URL(ADMIN_URL);
  u.pathname = `/${name}`;
  const url = u.toString();

  const run = spawnSync(process.execPath, ['scripts/prisma.mjs', 'migrate', 'deploy'], {
    cwd: DB_DIR,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: url, DATABASE_DIRECT_URL: url },
  });
  if (run.status !== 0) {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$disconnect();
    const out = run.stdout + run.stderr;
    throw new Error(`migrate deploy failed on the test database:\n${u.password ? out.split(u.password).join('***') : out}`);
  }

  const prisma = new PrismaClient({ datasourceUrl: url });
  return {
    url,
    prisma,
    async drop() {
      await prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.$disconnect();
    },
  };
}

/** A store for the tests (test data only, never the owner's). */
export async function makeStore(
  prisma: PrismaClient,
  slug: string,
  extra: { status?: 'DRAFT' | 'LIVE'; isPrimary?: boolean; name?: string } = {},
) {
  return prisma.store.create({
    data: {
      slug,
      name: extra.name ?? `Test store ${slug}`,
      status: extra.status ?? 'DRAFT',
      isPrimary: extra.isPrimary ? true : null,
      defaultLocale: 'bn-BD',
      currency: 'BDT',
      timezone: 'Asia/Dhaka',
    },
  });
}

/** Every row of the given models, ordered by id, as one string: equal before and after = nothing changed. */
export async function fingerprint(prisma: PrismaClient, models: readonly string[]): Promise<string> {
  const delegates = prisma as unknown as Record<string, { findMany(args: unknown): Promise<unknown[]> }>;
  const parts: string[] = [];
  for (const m of models) {
    const rows = await delegates[m.charAt(0).toLowerCase() + m.slice(1)]!.findMany({ orderBy: { id: 'asc' } });
    parts.push(`${m}:${JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
  }
  return parts.join('\n');
}
