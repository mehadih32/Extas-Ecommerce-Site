// S13 · PR 273 — Marketing › Referrals: GET the page (`marketing.campaigns.read`); PUT the programme card
// (`rules.approve`, the owner's OK); POST {action: 'reward', id, confirm: true} (`payments.wallet`)
// (lib/marketing/referrals.ts). The friend's offer is a Smart Rule; the sharer's reward is a wallet credit.
import { adminDeps } from '@/lib/admin-auth';
import { referralsHandler } from '@/lib/marketing/referrals';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => referralsHandler(request, adminDeps());
export const POST = (request: Request) => referralsHandler(request, adminDeps());
export const PUT = (request: Request) => referralsHandler(request, adminDeps());
