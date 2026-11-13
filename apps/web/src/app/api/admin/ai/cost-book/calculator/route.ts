// S15 · PR 316 — /api/admin/ai/cost-book/calculator: POST {lines, description?, save?} (`ai.control`). Previews a
// free-form plan's cost, or saves it onto AiCostPlan. lib/admin-ai/calculator-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { calculatorHandler } from '@/lib/admin-ai/calculator-api';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) => calculatorHandler(request, adminDeps());
