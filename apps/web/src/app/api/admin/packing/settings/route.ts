// S20 · PR 404 — Orders › Packing & print: GET the documents' settings cards (`fulfilment.read`), PUT one card
// (`fulfilment.printSettings`) (lib/packing-settings-api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { packingSettingsHandler } from '@/lib/packing-settings-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return packingSettingsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return packingSettingsHandler(request, adminDeps());
}
