// S18 · PR 390 — the Site manual as one Markdown file, downloaded (lib/admin-shell/manual-md.ts).
import { manualMdHandler } from '@/lib/admin-shell/manual-md';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return manualMdHandler(request);
}
