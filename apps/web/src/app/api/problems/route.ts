// S21 · PR 423 (CN-015) — the shop's pages report a visitor's problems (lib/problems/ingest.ts). Public, same-site
// only, size-capped and counted per address by the proxy; nothing personal is kept and nothing is changed for anyone.
import { adminDeps } from '@/lib/admin-auth';
import { problemsHandler } from '@/lib/problems/ingest';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return problemsHandler(request, adminDeps());
}
