// S18 · PR 378 — the browser's page protection reports (lib/security/csp-report.ts). Public, report-only: it changes
// nothing, keeps nothing personal, and the proxy limits how many reports one address may send.
import { cspReportHandler } from '@/lib/security/csp-report';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return cspReportHandler(request);
}
