// S02 · PR 83 — Reports › Experiments: GET the A/B tests with their results (`reports.experiments.read`); POST a new
// draft, PUT the module's card (`reports.experiments.write`) (lib/experiments/admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { experimentsHandler } from '@/lib/experiments/admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => experimentsHandler(request, adminDeps());
export const POST = (request: Request) => experimentsHandler(request, adminDeps());
export const PUT = (request: Request) => experimentsHandler(request, adminDeps());
