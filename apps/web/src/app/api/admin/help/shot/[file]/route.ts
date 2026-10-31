// S18 · PR 388 — one picture of the Site manual with its numbered marks (lib/admin-shell/shot-api.ts).
import { shotHandler } from '@/lib/admin-shell/shot-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  return shotHandler(request, (await params).file);
}
