// S08 · PR 193 — Delivery › Delivery settings: GET the cards (`delivery.read`), PUT one card (`delivery.charges`); first
// the holiday mode (lib/delivery-settings-api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { deliverySettingsHandler } from '@/lib/delivery-settings-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return deliverySettingsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return deliverySettingsHandler(request, adminDeps());
}
