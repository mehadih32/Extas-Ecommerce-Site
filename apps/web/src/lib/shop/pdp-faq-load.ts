// S28 · PR 682 — the FAQs a product page shows: its own, its category's and the shop-wide ones, active and not archived.
// Read-only and public; without a database (CI's build) or when it is slow: none, never a guess.
import { cache } from 'react';
import { getPrisma } from '@extas/db/client';
import { pickFaqs, type FaqPickRow, type PickedFaq } from '@extas/catalogue';
import { settingsTimeoutMs, withTimeout } from '../settings';

export async function faqRows(storeId: number, productId: string): Promise<FaqPickRow[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const db = getPrisma();
    return await withTimeout(
      (async () => {
        const p = await db.product.findFirst({ where: { id: productId, storeId }, select: { categoryId: true } });
        return db.productFaq.findMany({
          where: {
            storeId,
            isActive: true,
            archivedAt: null,
            OR: [{ scope: 'PRODUCT', productId }, ...(p?.categoryId ? [{ scope: 'CATEGORY' as const, categoryId: p.categoryId }] : []), { scope: 'SHOP' }],
          },
          select: { scope: true, questionEn: true, questionBn: true, answerEn: true, answerBn: true, sortOrder: true, createdAt: true },
        });
      })(),
      settingsTimeoutMs() * 2,
    );
  } catch (e) {
    console.warn(`shop: product FAQs unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return [];
  }
}

export const faqRowsOnce = cache(faqRows);

export async function pickedFaqs(storeId: number, productId: string, set: { on: boolean; includeShop: boolean; max: number }, lang: 'en' | 'bn'): Promise<PickedFaq[]> {
  if (!set.on) return [];
  return pickFaqs(await faqRowsOnce(storeId, productId), { lang, includeShop: set.includeShop, max: set.max });
}
