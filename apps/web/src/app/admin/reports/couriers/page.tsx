// S28 · PR 670 — Reports tab "Couriers": opens the default courier's Courier 360 on its Performance section. No screen of its own (admin-guide notGuided).
import { openDefaultCourier } from '@/lib/admin-couriers-open';

export const dynamic = 'force-dynamic';

export default async function CouriersTab() {
  return openDefaultCourier('/admin/reports/couriers', 'performance');
}
