// PR 500 — Keys & connections: every declared connection with its state (never a key's value).
import { adminDeps } from '@/lib/admin-auth';
import { integrationsHandler } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return integrationsHandler(request, adminDeps());
}
