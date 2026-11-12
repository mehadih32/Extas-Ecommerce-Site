// S24 · PR 445 — Marketing › Studio › Model library: GET the library (`photoshoot.read`); POST
// {action: 'create' | 'update' | 'archive' | 'restore' | 'addAsset' | 'removeAsset' | 'recordConsent', ...}
// (`photoshoot.write`) (lib/marketing/studio-models.ts).
import { adminDeps } from '@/lib/admin-auth';
import { studioModelsHandler } from '@/lib/marketing/studio-models';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => studioModelsHandler(request, adminDeps());
export const POST = (request: Request) => studioModelsHandler(request, adminDeps());
