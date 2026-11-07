// Follow-up 618 (PR 378, 22) — the admin's file uploads pass Caddy's own size limit first (server.conf
// CADDY_UPLOAD_MAX_MB, infra/stack/caddy/Caddyfile `body_limits`), which the app gets as EXTAS_UPLOAD_MAX_MB
// (infra/stack/app.yml). A size setting raised past it (`media.upload.maxBytes`, `support.attachments` maxMb) would let
// the page offer a file the server then refuses with a bare 413 before the app sees it. The Server page names each such
// setting; nothing is changed here.

export const UPLOAD_LIMIT_ENV = 'EXTAS_UPLOAD_MAX_MB';
const MB = 1024 * 1024;

/** The edge's upload limit in bytes, or null when the server did not say (local runs, an older deploy). */
export function edgeUploadMaxBytes(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env[UPLOAD_LIMIT_ENV]?.trim();
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) return null;
  const mb = Number(raw);
  return mb > 0 ? Math.floor(mb * MB) : null;
}

export interface UploadLimitProblem {
  /** The setting over the edge's limit. */
  key: 'media.upload.maxBytes' | 'support.attachments';
  /** Its size and the edge's, in whole MB (rounded up / down so the words never hide the gap). */
  settingMb: number;
  edgeMb: number;
}

/** Every upload size setting above the edge's limit (none when the limit is not known). */
export function uploadLimitProblems(set: { mediaMaxBytes: number; supportMaxMb: number | null }, edgeBytes: number | null): UploadLimitProblem[] {
  if (edgeBytes == null) return [];
  const edgeMb = Math.floor(edgeBytes / MB);
  const out: UploadLimitProblem[] = [];
  if (set.mediaMaxBytes > edgeBytes) out.push({ key: 'media.upload.maxBytes', settingMb: Math.ceil(set.mediaMaxBytes / MB), edgeMb });
  if (set.supportMaxMb != null && set.supportMaxMb * MB > edgeBytes) out.push({ key: 'support.attachments', settingMb: Math.ceil(set.supportMaxMb), edgeMb });
  return out;
}
