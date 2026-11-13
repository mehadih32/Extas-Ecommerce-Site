// S28 · PR 682 — /api/admin/faqs: product, category and shop-wide FAQs.
//   GET    ?scope=PRODUCT|CATEGORY|SHOP, ?productId, ?categoryId, ?archived=1   the list (`catalogue.read`)
//   POST   {scope, productId? | categoryId?, questionEn, answerEn, questionBn?, answerBn?}  a new FAQ (`catalogue.write`)
//          {fromQuestionId, scope}   "Make this an FAQ" from an answered, published customer question
// /api/admin/faqs/<id>
//   PATCH  {questionEn?, answerEn?, questionBn?, answerBn?, sortOrder?, isActive?}
//   DELETE archives it (nothing is deleted); POST {unarchive: true} brings it back
// The catalogue service checks the permission again, the store and writes the audit log.
import * as cat from '@extas/catalogue';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './catalogue-api';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function faqsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m === 'GET') {
    return handle(request, deps, 'catalogue.read', async (c) => {
      const q = c.url.searchParams;
      return {
        faqs: await cat.listFaqs(c.deps, c.who, {
          ...(q.get('scope') ? { scope: q.get('scope') } : {}),
          ...(q.get('productId') ? { productId: q.get('productId') } : {}),
          ...(q.get('categoryId') ? { categoryId: q.get('categoryId') } : {}),
          ...(['1', 'true'].includes(q.get('archived') ?? '') ? { archived: true } : {}),
        }),
      };
    });
  }
  if (m !== 'POST') return Promise.resolve(fail(405, 'method-not-allowed'));
  return handle(
    request,
    deps,
    'catalogue.write',
    async (c) => {
      const b = await body(request);
      if (isObj(b) && typeof b.fromQuestionId === 'string') {
        if (!isUuid(b.fromQuestionId)) return fail(400, 'INVALID_INPUT', ['fromQuestionId']);
        return { faq: await cat.makeFaqFromQuestion(c.deps, c.who, b.fromQuestionId, { scope: b.scope }) };
      }
      return { faq: await cat.createFaq(c.deps, c.who, b) };
    },
    201,
  );
}

export function faqHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  const m = request.method.toUpperCase();
  if (!isUuid(id)) return Promise.resolve(fail(400, 'INVALID_INPUT', ['id']));
  if (!['PATCH', 'DELETE', 'POST'].includes(m)) return Promise.resolve(fail(405, 'method-not-allowed'));
  return handle(request, deps, 'catalogue.write', async (c) => {
    if (m === 'PATCH') return { faq: await cat.updateFaq(c.deps, c.who, id, await body(request)) };
    if (m === 'DELETE') {
      await cat.archiveFaq(c.deps, c.who, id, true);
      return { archived: true };
    }
    const b = await body(request);
    if (!isObj(b) || b.unarchive !== true) return fail(400, 'INVALID_INPUT', ['unarchive']);
    await cat.archiveFaq(c.deps, c.who, id, false);
    return { archived: false };
  });
}
