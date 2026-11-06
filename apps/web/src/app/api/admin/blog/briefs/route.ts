// S12 · PR 528 — the blog brief form: a new brief's screen (GET, `blog.read`; `?topic=` starts it from a topic), a new
// brief (POST, `blog.write`) and the brief card (PUT {key: 'brief'}, `blog.publish`) (lib/journal/briefs.ts).
import { adminDeps } from '@/lib/admin-auth';
import { briefHandler } from '@/lib/journal/briefs';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return briefHandler(request, adminDeps(), null);
}

export function POST(request: Request) {
  return briefHandler(request, adminDeps(), null);
}

export function PUT(request: Request) {
  return briefHandler(request, adminDeps(), null);
}
