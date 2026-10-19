// Test helper (never imported by app code): a throwaway PostgreSQL database, created, migrated with the real
// migrations and dropped afterwards, so tests never touch a shared database. Needs TEST_DATABASE_ADMIN_URL — a
// connection to a server where the user may CREATE DATABASE (CI: the db job's service). Without it the database
// tests are skipped. Connection strings are never printed.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@extas/db/client';

export const TEST_ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL || '';
export const HAS_TEST_DB = TEST_ADMIN_URL !== '';

const DB_DIR = fileURLToPath(new URL('../../db/', import.meta.url));

export interface TestDatabase {
  url: string;
  prisma: PrismaClient;
  drop(): Promise<void>;
}

export async function createTestDatabase(label: string): Promise<TestDatabase> {
  const name = `auth_test_${label.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}_${randomBytes(4).toString('hex')}`;
  const admin = new PrismaClient({ datasourceUrl: TEST_ADMIN_URL });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const u = new URL(TEST_ADMIN_URL);
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

/** Two sample stores (sample data only, never the owner's). */
export async function seedSampleStores(prisma: PrismaClient): Promise<[number, number]> {
  const a = await prisma.store.create({
    data: { slug: 'sample-a', name: 'Sample store A', isPrimary: true, defaultLocale: 'bn-BD', currency: 'BDT', timezone: 'Asia/Dhaka' },
  });
  const b = await prisma.store.create({
    data: { slug: 'sample-b', name: 'Sample store B', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' },
  });
  return [a.id, b.id];
}
