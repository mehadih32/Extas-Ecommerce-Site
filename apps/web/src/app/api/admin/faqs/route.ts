// S28 · PR 682 — product, category and shop-wide FAQs (lib/catalogue-faq-api).
import { adminDeps } from '@/lib/admin-auth';
import { faqsHandler } from '@/lib/catalogue-faq-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => faqsHandler(request, adminDeps());
export const POST = (request: Request) => faqsHandler(request, adminDeps());
