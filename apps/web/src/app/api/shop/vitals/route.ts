// S11 · PR 234 — public: one Core Web Vitals reading from a shop page (lib/seo/vitals-data). Always 204.
import { vitalsHandler } from '@/lib/seo/vitals-data';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return vitalsHandler(request);
}
