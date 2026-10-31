// S18 · PR 388 — GET /api/admin/help/shot/<file>: one picture of the Site manual (a smoke-test screenshot named in
// marks.json, lib/admin-shell/shots.ts), for someone signed in who may read the help (`help.read`). Any other file,
// including the smoke test's other pictures, is not found. Read-only.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps, errorResponse, fail, guardAdmin, type AdminDeps } from '../admin-auth';
import { shotFile } from './shots';

// hardcode-ok: how long the browser may keep a picture (they change only with a new smoke run), a technical constant
const CACHE = 'private, max-age=300';

export async function shotHandler(request: Request, file: string, deps: AdminDeps | null = adminDeps(), read = shotFile): Promise<Response> {
  const g = await guardAdmin(request, deps, { permission: 'help.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  try {
    const body = await read(file);
    if (!body) return fail(404, 'NOT_FOUND');
    return new Response(new Uint8Array(body), { status: 200, headers: { 'content-type': 'image/jpeg', 'cache-control': CACHE, 'x-content-type-options': 'nosniff' } });
  } catch (e) {
    return errorResponse(e);
  }
}
