// S28 · PR 680-685 — the product screens' settings cards (lib/products-v5-settings-api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { productV5SettingsHandler } from '@/lib/products-v5-settings-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return productV5SettingsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return productV5SettingsHandler(request, adminDeps());
}
