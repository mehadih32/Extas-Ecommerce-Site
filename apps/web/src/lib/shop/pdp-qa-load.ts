// PR 66 — a product's answered questions for its page: approved, answered, not archived, newest answer first, at most
// `max`. Read-only and public (the asker is never shown). Without a database (CI's build, `next build`) or when it is
// slow, no questions: the block then shows only the WhatsApp ask, never a guess.
import { getPrisma } from '@extas/db/client';
import { settingsTimeoutMs, withTimeout } from '../settings';
import type { QaRow } from './pdp-qa';

export async function answeredQuestions(storeId: number, productId: string, max: number): Promise<QaRow[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await withTimeout(
      getPrisma().productQuestion.findMany({
        where: { storeId, productId, status: 'APPROVED', archivedAt: null, answer: { not: null } },
        orderBy: [{ answeredAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: max,
        select: { id: true, question: true, answer: true, answeredAt: true },
      }),
      settingsTimeoutMs() * 2,
    );
    return rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer ?? '', answeredAt: r.answeredAt?.toISOString() ?? null }));
  } catch (e) {
    console.warn(`shop: product questions unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return [];
  }
}
