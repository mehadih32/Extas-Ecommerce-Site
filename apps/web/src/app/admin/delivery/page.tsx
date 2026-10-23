// PR 12 (CN-022) — the delivery bands page moved to the Delivery section's "Zones & charges" tab, /admin/delivery/zones
// (demo V12.3). The old address answers with a permanent redirect (308), keeping its query, until the section's own
// overview (couriers, parcels to book, in transit: S06/S07) is built here.
import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DeliveryMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, x);
  const rest = q.toString();
  permanentRedirect(`/admin/delivery/zones${rest ? `?${rest}` : ''}`);
}
