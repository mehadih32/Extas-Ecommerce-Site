// S21 · PR 594 (HLP-02) — the API of Help & Build › Build progress:
//   GET  /api/admin/build/problems?view=open|done|all&pr=       the reported problems (`build.read`)
//   POST /api/admin/build/problems {action: 'report', pr, note, page?}
//                                                              a problem on one PR the register has (`build.report`)
//   POST /api/admin/build/problems {action: 'status', id, status, note?}
//                                                              its status: OPEN, FIXING, FIXED (how), CLOSED (why) (`build.report`)
//   GET  /api/admin/build/files?path=<docs path>&v=<copy id>   one Markdown file of the deploy's docs copy, or one of its
//                                                              kept versions, as a download (`build.read`)
// The register and the files are read from the server's docs copy (lib/build-register.ts, lib/build-files.ts).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { guideDir } from './admin-shell/guide';
import { readDoc, readDocVersion } from './build-files';
import { isBuildProblemError, listProblems, reportProblem, setProblemStatus } from './build-problems';
import { docsRoot, readRegister } from './build-register';

/** The docs copy the app reads (null when the deploy has none). */
export function docsDir(): string | null {
  const g = guideDir();
  return g ? docsRoot(g) : null;
}

export async function buildProblemsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'build.read' : 'build.report', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const who = { actor: g.actor, storeId: MOTHER_STORE_ID, ctx: g.ctx };
  try {
    if (method === 'GET') {
      const q = new URL(request.url).searchParams;
      const pr = Number(q.get('pr'));
      return json({ ok: true, ...(await listProblems(deps!.db, MOTHER_STORE_ID, { view: q.get('view') ?? undefined, pr: Number.isInteger(pr) && pr > 0 ? pr : undefined })) });
    }
    const { action, ...rest } = await body(request);
    if (action === 'report') {
      const dir = docsDir();
      const reg = dir ? await readRegister(dir) : null;
      return json({ ok: true, problem: await reportProblem(deps!.db, who, rest, (n) => !!reg?.reg.prs.has(n)) }, { status: 201 });
    }
    if (action === 'status') return json({ ok: true, problem: await setProblemStatus(deps!.db, who, rest) });
    return fail(422, 'INVALID_INPUT', ['action']);
  } catch (e) {
    if (isBuildProblemError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

export async function buildFilesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'build.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  try {
    const q = new URL(request.url).searchParams;
    const path = q.get('path') ?? '';
    const v = q.get('v');
    const dir = docsDir();
    const doc = dir ? await readDoc(dir, path) : null;
    if (!dir || !doc) return fail(404, 'NOT_FOUND', ['path']);
    const text = v ? await readDocVersion(dir, path, v) : doc.text;
    if (text === null) return fail(404, 'NOT_FOUND', ['v']);
    const name = `${path.split('/').pop()!.replace(/\.md$/, '')}${v ? `-${v}` : ''}.md`;
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
