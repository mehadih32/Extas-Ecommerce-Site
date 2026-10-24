// PR 594 (CN-026) — the guide of the page the person is on: its own Bengali guide, the section's overview and the
// section's other pages (lib/admin-shell/api.ts guideHandler, read from the deployed docs copy).
import { guideHandler } from '@/lib/admin-shell/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return guideHandler(request);
}
