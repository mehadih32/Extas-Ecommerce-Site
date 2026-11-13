// S28 · PR 684 — demo (sample) products (lib/catalogue-demo-api).
import { adminDeps } from '@/lib/admin-auth';
import { demoHandler } from '@/lib/catalogue-demo-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => demoHandler(request, adminDeps());
export const POST = (request: Request) => demoHandler(request, adminDeps());
