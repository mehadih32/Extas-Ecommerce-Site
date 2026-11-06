// S02 · PR 80 follow-up 679 — Website › Eye-toggles › Door note words: GET the owner's words (`website.read`); PUT new
// words (`website.eye.write`, audited). Empty words: the shop's door note draws nothing (lib/website/eye-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { doorNoteHandler } from '@/lib/website/eye-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => doorNoteHandler(request, adminDeps());
export const PUT = (request: Request) => doorNoteHandler(request, adminDeps());
