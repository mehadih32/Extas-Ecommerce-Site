// CN-053 — which build this server runs, short, for the admin's footer line and /status: so what a browser really runs can
// be read off the screen without clearing anything. The commit of the image (GIT_SHA), else "dev".
export const BUILD_ID_LENGTH = 7; // hardcode-ok: the usual short commit length
export function buildId(sha: string | undefined = process.env.GIT_SHA): string {
  const v = (sha ?? '').trim().toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(v) ? v.slice(0, BUILD_ID_LENGTH) : 'dev';
}
