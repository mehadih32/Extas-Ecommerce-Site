// S02 · PR 78 — Website › Words & language: GET a page of the shop's words, or ?format=csv every word (`website.read`);
// PUT a change to some words or an imported CSV (`website.words.write`) (lib/website/words-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { dictionaryHandler } from '@/lib/website/words-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => dictionaryHandler(request, adminDeps());
export const PUT = (request: Request) => dictionaryHandler(request, adminDeps());
