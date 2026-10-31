// S21 · PR 570 (B7.3) — AI › Checklist audit (GET `health.read`; PUT the switches and POST "Run now" `settings.write`);
// lib/admin-health/audit-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { auditHandler } from '@/lib/admin-health/audit-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return auditHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return auditHandler(request, adminDeps());
}

export function POST(request: Request) {
  return auditHandler(request, adminDeps());
}
