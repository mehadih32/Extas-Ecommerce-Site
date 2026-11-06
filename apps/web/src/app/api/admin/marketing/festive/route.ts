// S13 · PR 281 — Marketing › Festive cut-off: GET the page (`marketing.campaigns.read`); PUT the settings card
// (`marketing.campaigns.write`) (lib/marketing/festive-cutoff.ts).
import { adminDeps } from '@/lib/admin-auth';
import { festiveCutoffHandler } from '@/lib/marketing/festive-cutoff';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => festiveCutoffHandler(request, adminDeps());
export const PUT = (request: Request) => festiveCutoffHandler(request, adminDeps());
