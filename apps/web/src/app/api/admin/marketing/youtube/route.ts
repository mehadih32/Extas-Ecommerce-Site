// S13 · PR 278 — Marketing › YouTube: GET the page (`marketing.campaigns.read`); PUT the settings card and POST an action
// (channel or video added, changed, set aside; `marketing.campaigns.write`) (lib/marketing/youtube.ts).
import { adminDeps } from '@/lib/admin-auth';
import { youtubeHandler } from '@/lib/marketing/youtube';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => youtubeHandler(request, adminDeps());
export const POST = (request: Request) => youtubeHandler(request, adminDeps());
export const PUT = (request: Request) => youtubeHandler(request, adminDeps());
