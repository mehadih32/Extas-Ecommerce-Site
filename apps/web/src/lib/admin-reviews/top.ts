// PR 964 (admin prototype v5, Products › Reviews & questions): the five figures that sit under the heading of all four tabs
// (Questions, Reviews, Hidden, FAQs): average rating, reviews on the pages, reviews waiting to publish, questions to answer and
// published 1-2 star reviews without a reply. Reading needs `reviews.read`; the FAQs page, which only needs `catalogue.read`,
// gets null for a person without it and then simply shows no figures.
import * as cat from '@extas/catalogue';
import type { CatalogueAccess } from '@/lib/admin-products';

export interface ReviewTopFigures {
  average: number | null;
  published: number;
  pending: number;
  questions: number;
  unreplied: number;
}

export async function loadReviewTop(c: CatalogueAccess): Promise<ReviewTopFigures | null> {
  try {
    const [desk, pending, questions] = await Promise.all([
      cat.reviewDesk(c.deps, c.who),
      cat.listReviews(c.deps, c.who, { status: 'PENDING' }),
      cat.listQuestions(c.deps, c.who, { view: 'open' }),
    ]);
    return { average: desk.average, published: desk.published, pending: pending.counts.PENDING, questions: questions.counts.unanswered, unreplied: desk.unreplied };
  } catch {
    return null;
  }
}
