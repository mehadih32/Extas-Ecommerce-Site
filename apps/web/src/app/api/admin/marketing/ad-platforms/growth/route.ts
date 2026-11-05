// S13 · PR 269 — Marketing › Ad platforms › Growth agent: GET the figures and the proposals (`marketing.campaigns.read`);
// POST {action: 'run'} (`marketing.ads.control`) or the owner's decision {action: 'decide'} (`marketing.ads.approve`);
// PUT the agent's limits (`marketing.ads.approve`) (lib/marketing/growth-agent.ts). Proposals only wait; practice writers.
import { adminDeps } from '@/lib/admin-auth';
import { growthAgentHandler } from '@/lib/marketing/growth-agent';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => growthAgentHandler(request, adminDeps());
export const POST = (request: Request) => growthAgentHandler(request, adminDeps());
export const PUT = (request: Request) => growthAgentHandler(request, adminDeps());
