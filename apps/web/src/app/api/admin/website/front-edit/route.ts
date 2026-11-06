// S02 · PR 79 — editing the shop's words on the shop page: GET the switch card (`website.read`), PUT the switch
// (`website.words.write`), POST the words a shop page shows (`website.read`, while the switch is on)
// (lib/website/front-edit.ts). Publishing uses PUT /api/admin/website/dictionary.
import { adminDeps } from '@/lib/admin-auth';
import { frontEditHandler } from '@/lib/website/front-edit';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => frontEditHandler(request, adminDeps());
export const PUT = (request: Request) => frontEditHandler(request, adminDeps());
export const POST = (request: Request) => frontEditHandler(request, adminDeps());
