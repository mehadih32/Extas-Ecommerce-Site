// PR 1066 — the Admin map for the overlay that opens on the same page (components/admin/map/MapOverlay.tsx).
// Read only; needs a signed-in admin with `help.read` (everyone), and lists only the pages the person may open.
import { NextResponse } from 'next/server';
import { adminDeps } from '@/lib/admin-auth';
import { adminView, pageAccess } from '@/lib/admin-page';
import { buildMapScreen, withMapDict } from '@/lib/admin-map-screen';

export const dynamic = 'force-dynamic';

export async function GET() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('help.read', deps)]);
  if (access.kind !== 'ok') return NextResponse.json({ ok: false, reason: access.kind }, { status: access.kind === 'forbidden' ? 403 : 401 });
  const screen = await buildMapScreen(withMapDict(plain));
  return NextResponse.json({ ok: true, ...screen }, { headers: { 'cache-control': 'no-store' } });
}
