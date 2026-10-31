// S18 · PR 388 (B7.5) — a page's picture in the Site manual with its numbered marks: the smoke test's screenshot of the
// page (GET /api/admin/help/shot/<file>), a numbered ring over each marked part, and the numbers' names below it. With
// a computer and a phone picture, a wide screen shows the computer one and a phone the phone one. Positions are
// fractions of the picture (lib/admin-shell/shots.ts), so the marks stay on their parts at any width.
import type { PageShot } from '@/lib/admin-shell/shots';

export const SHOT_API = '/api/admin/help/shot';

export function ManualShots({ shots, title, alt, taken }: { shots: PageShot[]; title: string; alt: string; taken: string | null }) {
  if (!shots.length) return null;
  const both = shots.length > 1;
  return (
    <div className="a2-man-shots" data-testid="manual-shots">
      {shots.map((s) => (
        <figure key={s.screen} className={`a2-man-shot ${s.screen}${both ? '' : ' only'}`} data-testid="manual-shot" data-screen={s.screen}>
          <div className="a2-man-pic">
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed-in admin picture, not an optimisable asset */}
            <img src={`${SHOT_API}/${encodeURIComponent(s.file)}`} alt={`${title} — ${alt}`} loading="lazy" decoding="async" />
            {s.marks.map((m) => (
              <span
                key={m.n}
                className="a2-man-mk"
                aria-hidden="true"
                data-testid="manual-mark"
                style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
              >
                <b>{m.n}</b>
              </span>
            ))}
          </div>
          {s.marks.length || taken ? (
            <figcaption>
              {s.marks.length ? (
                <div className="a2-man-mkl">
                  {s.marks.map((m) => (
                    <span key={m.n}>
                      <b>{m.n}</b> {m.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {taken ? <small>{taken}</small> : null}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
