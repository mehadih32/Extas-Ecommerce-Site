// S14 · PR 534 — a customer's grade and verified mark as small pills (demo V12.4 97u a2Grade), for the team only: the
// customer list, the customer page and Orders › To confirm. Nothing shows while the owner's grading is off (mark null).
import type { GradeMark } from '@extas/customers';

export function GradePill({ mark, lang, verified }: { mark: GradeMark | null; lang: string; verified: string }) {
  if (!mark || (!mark.grade && !mark.verified)) return null;
  return (
    <span className="a2-gap8" style={{ display: 'inline-flex', marginLeft: 6, verticalAlign: 'middle' }} data-testid="grade-pill">
      {mark.grade ? <span className="a2-pill info">{(lang === 'bn' && mark.grade.nameBn) || mark.grade.nameEn}</span> : null}
      {mark.verified ? <span className="a2-pill ok">✓ {verified}</span> : null}
    </span>
  );
}
