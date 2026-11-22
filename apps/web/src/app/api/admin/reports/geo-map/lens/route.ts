// S29 · PR 757–760 — Reports › Geography map lenses as JSON, one route:
//   ?lens=courier (or no lens) → the courier and coverage lens (PR 757, lib/geo-map/lens-route.ts)
//   ?lens=risk|money|demand    → the risk, money and stock, demand and customers lenses (PR 758–760, lib/geo-map/lens-api.ts)
// The map is off as shipped, and so is every lens. Advice and figures only; nothing here changes a rule, a price or a courier.
import { adminDeps } from '@/lib/admin-auth';
import { geoLensRoute } from '@/lib/geo-map/lens-api';
import { lensRoute } from '@/lib/geo-map/lens-route';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const lens = new URL(request.url).searchParams.get('lens');
  if (lens === null || lens === 'courier') return lensRoute(request, adminDeps());
  return geoLensRoute(request, adminDeps());
}
export const POST = GET;
