// PR 627 (CN-036, LUMEN-SPEC §3 item 7) — skeleton loading: grey shapes where the tiles, the chart, a list's rows or
// lines of text will be, gently shimmering while the page fetches (no shimmer when motion is reduced: the theme
// layer stops it). The area says it is busy (aria-busy) and names what is loading for a screen reader.
export type SkeletonKind = 'tiles' | 'chart' | 'rows' | 'lines' | 'split' | 'form';

const range = (n: number) => Array.from({ length: Math.max(1, Math.min(24, Math.floor(n))) }, (_, i) => i);

export function Skeleton({ kind, count = 4, label, testId = 'lm-skel' }: { kind: SkeletonKind; count?: number; label: string; testId?: string }) {
  return (
    <div className={`lm-skel lm-skel-${kind}`} aria-busy="true" role="status" data-testid={testId}>
      <span className="lm-vh">{label}</span>
      {kind === 'tiles'
        ? range(count).map((i) => (
            <div key={i} className="lm-skel-card" aria-hidden="true">
              <i className="w40" />
              <i className="big w60" />
              <i className="w30" />
            </div>
          ))
        : null}
      {kind === 'chart' ? (
        <div className="lm-skel-card tall" aria-hidden="true">
          <i className="w30" />
          <i className="big w40" />
          <i className="plot" />
        </div>
      ) : null}
      {kind === 'rows' || kind === 'split'
        ? (
            <div className="lm-skel-card" aria-hidden="true">
              {range(count).map((i) => (
                <div key={i} className="lm-skel-row">
                  <i className="dot" />
                  <i className={i % 2 ? 'w60' : 'w80'} />
                  <i className="w20" />
                </div>
              ))}
            </div>
          )
        : null}
      {kind === 'split' ? (
        <div className="lm-skel-card tall" aria-hidden="true">
          <i className="big w40" />
          {range(5).map((i) => (
            <i key={i} className={i % 2 ? 'w60' : 'w80'} />
          ))}
        </div>
      ) : null}
      {kind === 'lines' ? (
        <div aria-hidden="true">
          {range(count).map((i) => (
            <i key={i} className={i % 3 === 2 ? 'w60' : 'w100'} />
          ))}
        </div>
      ) : null}
      {kind === 'form' ? (
        <>
          <div className="lm-skel-card" aria-hidden="true">
            {range(count).map((i) => (
              <div key={i} className="lm-skel-field">
                <i className="w30" />
                <i className="box" />
              </div>
            ))}
          </div>
          <div className="lm-skel-card tall" aria-hidden="true">
            <i className="w40" />
            <i className="plot" />
          </div>
        </>
      ) : null}
    </div>
  );
}
