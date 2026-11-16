// PR 964 (admin prototype v5, Products › Reviews & questions): the five figures and the rule line under the heading, the same on all
// four tabs (Questions, Reviews, Hidden, FAQs). Drawn on the server; read only. The words are `rev.kpi.*` and `rev.callout`.
import { t, type Dict } from '@/lib/i18n';
import type { ReviewTopFigures } from '@/lib/admin-reviews/top';

export function ReviewTop({ d, f, n }: { d: Dict; f: ReviewTopFigures; n: (x: number) => string }) {
  const tiles: [string, string][] = [
    ['average', f.average === null ? t(d, 'rev.kpi.averageNone') : `${f.average.toFixed(2)} ★`],
    ['published', n(f.published)],
    ['pending', n(f.pending)],
    ['questions', n(f.questions)],
    ['unreplied', n(f.unreplied)],
  ];
  return (
    <>
      <div className="a2-kpis k5 a2-mt12" data-testid="review-kpis">
        {tiles.map(([id, value]) => (
          <div key={id} className="a2-card a2-kpi" data-testid={`review-kpi-${id}`}>
            <div className="a2-kl">{t(d, `rev.kpi.${id}`)}</div>
            <div className="a2-kv">{value}</div>
          </div>
        ))}
      </div>
      <div className="a2-note" role="note" data-testid="review-callout">
        {t(d, 'rev.callout')}
      </div>
    </>
  );
}
