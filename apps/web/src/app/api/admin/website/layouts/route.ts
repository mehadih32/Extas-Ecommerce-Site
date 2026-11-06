// S02 · PR 76 — Website › Page layouts: GET one page's sections (`website.read`); PUT its new order, shown sections and
// screens (`website.layout.write`) (lib/website/layouts-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { layoutsHandler } from '@/lib/website/layouts-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => layoutsHandler(request, adminDeps());
export const PUT = (request: Request) => layoutsHandler(request, adminDeps());
