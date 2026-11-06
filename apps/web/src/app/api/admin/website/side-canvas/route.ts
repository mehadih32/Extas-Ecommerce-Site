// S02 · PR 596 — Website › Side canvas: GET the switch, its numbers and the zones (`website.read`); PUT them
// (`website.layout.write`) (lib/website/side-canvas-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { sideCanvasHandler } from '@/lib/website/side-canvas-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => sideCanvasHandler(request, adminDeps());
export const PUT = (request: Request) => sideCanvasHandler(request, adminDeps());
