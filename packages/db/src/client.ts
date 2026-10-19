// @extas/db/client — the Prisma client alone, without the schema-reading helpers of schema-meta.ts (those read files
// next to the package, which a bundler such as Next.js cannot follow). Apps import this entry; tools and tests may
// keep using the package root, which re-exports everything here.
//
// The app connects through PgBouncer (DATABASE_URL); migrations use DATABASE_DIRECT_URL. Both come from the server's
// environment, which the deploy workflow fills from the vault (PR 493) — never from this repository.
//
// One client per process: Next.js dev reloads modules, so the client is kept on globalThis instead of a module
// variable. The client is created on first use, so importing this package never opens a connection.
import { PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient } from '@prisma/client';
export type { AdapterMode, IntegrationKind, StorageProvider } from '@prisma/client';

const holder = globalThis as unknown as { __extasPrisma?: PrismaClient };

/** The shared Prisma client, created on first call. */
export function getPrisma(): PrismaClient {
  holder.__extasPrisma ??= new PrismaClient();
  return holder.__extasPrisma;
}

/** Closes the shared client (tests, graceful shutdown). The next getPrisma() call creates a new one. */
export async function disconnectPrisma(): Promise<void> {
  const client = holder.__extasPrisma;
  holder.__extasPrisma = undefined;
  if (client) await client.$disconnect();
}

/** The mother store's id (Blueprint A4.5). A structural constant of the schema, not a business value. */
export const MOTHER_STORE_ID = 1;
