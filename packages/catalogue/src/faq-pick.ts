// S28 · PR 682 — which questions a product page shows: the product's own first, then its category's, then the
// shop-wide ones; each group by its order; the same question (any case) only once; no more than the setting allows.
// Pure, so the shop page, the markup and the tests read one rule.
export interface FaqPickRow {
  scope: 'PRODUCT' | 'CATEGORY' | 'SHOP';
  questionEn: string;
  questionBn: string | null;
  answerEn: string;
  answerBn: string | null;
  sortOrder: number;
  createdAt: Date;
}
export interface PickedFaq {
  question: string;
  answer: string;
  scope: FaqPickRow['scope'];
}

const RANK = { PRODUCT: 0, CATEGORY: 1, SHOP: 2 } as const;

export function pickFaqs(rows: readonly FaqPickRow[], opts: { lang: 'en' | 'bn'; includeShop: boolean; max: number }): PickedFaq[] {
  const seen = new Set<string>();
  const out: PickedFaq[] = [];
  const sorted = [...rows]
    .filter((r) => opts.includeShop || r.scope !== 'SHOP')
    .sort((a, b) => RANK[a.scope] - RANK[b.scope] || a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  for (const r of sorted) {
    const question = (opts.lang === 'bn' ? r.questionBn?.trim() || r.questionEn : r.questionEn).trim();
    const answer = (opts.lang === 'bn' ? r.answerBn?.trim() || r.answerEn : r.answerEn).trim();
    const key = question.toLowerCase();
    if (!question || !answer || seen.has(key)) continue;
    seen.add(key);
    out.push({ question, answer, scope: r.scope });
    if (out.length >= opts.max) break;
  }
  return out;
}
