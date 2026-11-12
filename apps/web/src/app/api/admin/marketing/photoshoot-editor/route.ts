// S24 · PR 457 — POST an editing session for Marketing › Photoshoot editor (`photoshoot.write`; lib/marketing/photoshootEditor.ts).
import { adminDeps } from '@/lib/admin-auth';
import { photoshootEditorHandler } from '@/lib/marketing/photoshootEditor';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) => photoshootEditorHandler(request, adminDeps());
