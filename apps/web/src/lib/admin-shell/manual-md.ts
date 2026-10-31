// S18 · PR 390 (Blueprint B7.5) — the Site manual's Markdown copy, kept with the blueprint documents: every deploy makes
// docs/MANUAL.md in the server's copy of the docs (infra/deploy/manual-md.sh from docs-sync.sh), so it sits beside
// BLUEPRINT.md and MASTER-REGISTER.md and goes into every backup's docs bundle. The admin offers it as a download
// (GET /api/admin/help/manual-md, `help.read`). A developer's checkout has none until the script is run by hand.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps, errorResponse, fail, guardAdmin, type AdminDeps } from '../admin-auth';
import { guideDir } from './guide';

/** Where the copy is: docs/MANUAL.md beside the guides' folder, or null without a docs folder. */
export const manualMdPath = (dir: string | null = guideDir()) => (dir ? join(/*turbopackIgnore: true*/ dir, '..', 'MANUAL.md') : null);

/** Whether the server holds the copy (the download button shows only then). */
export async function hasManualMd(path: string | null = manualMdPath()): Promise<boolean> {
  if (!path) return false;
  return stat(path)
    .then((s) => s.isFile() && s.size > 0)
    .catch(() => false);
}

/** The file name the browser saves: the shop's manual with the day it was downloaded. */
export const manualMdName = (day: string) => `site-manual-${day.replace(/[^0-9-]/g, '')}.md`;

export async function manualMdHandler(request: Request, deps: AdminDeps | null = adminDeps(), path: string | null = manualMdPath()): Promise<Response> {
  const g = await guardAdmin(request, deps, { permission: 'help.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  try {
    const text = path ? await readFile(path, 'utf8').catch(() => null) : null;
    if (!text) return fail(404, 'NOT_FOUND');
    const day = new Date().toISOString().slice(0, 10);
    return new Response(text, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${manualMdName(day)}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
