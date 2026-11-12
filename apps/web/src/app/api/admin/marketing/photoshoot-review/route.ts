// S24 · PR 458 — POST the owner's review decision for Marketing › Photoshoot review (`photoshoot.approve`;
// lib/marketing/photoshootReview.ts).
import { adminDeps } from '@/lib/admin-auth';
import { photoshootReviewHandler } from '@/lib/marketing/photoshootReview';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) => photoshootReviewHandler(request, adminDeps());
