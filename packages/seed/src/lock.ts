import type { Prisma } from '@extas/db/client';

// 508 + 0014: this package's own advisory lock id, so two seed jobs (pack, sample, import) never interleave. The settings
// sync uses its own id (4910496).
const SEED_LOCK = 'SELECT pg_advisory_xact_lock(5080014)::text AS locked';

export async function lockSeed(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRawUnsafe(SEED_LOCK);
}
