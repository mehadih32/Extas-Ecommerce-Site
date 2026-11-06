// S12 · PR 239 — Website › Blog & journal: the board (GET, `blog.read`), a new article (POST, `blog.write`) and the
// journal's card (PUT, `blog.publish`) (lib/journal/journal.ts).
import { adminDeps } from '@/lib/admin-auth';
import { journalHandler } from '@/lib/journal/journal';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return journalHandler(request, adminDeps(), null);
}

export function POST(request: Request) {
  return journalHandler(request, adminDeps(), null);
}

export function PUT(request: Request) {
  return journalHandler(request, adminDeps(), null);
}
