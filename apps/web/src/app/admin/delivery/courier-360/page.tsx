// S28 · PR 670 — "Courier 360" in the Couriers section (and the Finance and Reports tabs of the same name) open the default
// courier's Courier 360: the courier chosen in Delivery settings, else the first courier in use. With no courier yet the
// page goes to the Couriers list, where one is added. `?s=` names the section to open (the Finance tab opens Money, the
// Reports tab Performance). No screen of its own, so it has no guide page (admin-guide notGuided).
import { openDefaultCourier } from '@/lib/admin-couriers-open';

export const dynamic = 'force-dynamic';

export default async function Courier360Default() {
  return openDefaultCourier('/admin/delivery/courier-360');
}
