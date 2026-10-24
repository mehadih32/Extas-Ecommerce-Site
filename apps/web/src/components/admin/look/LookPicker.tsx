'use client';
// PR 12 (CN-025, CN-026 (b)) — the buttons of Settings → Admin look: "Use this design" (the person's own, scope "me"),
// "Make team default" (scope "team", settings.write) and the guide's "where it opens" choice (the person's own or the
// team's). Each one saves through PUT /api/admin/look and redraws the page; a refusal says so beside the button.
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

async function save(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch('/api/admin/look', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  return !!res?.ok;
}

function useSave(failed: string) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const run = (body: Record<string, unknown>) =>
    start(async () => {
      setNote(null);
      if (await save(body)) router.refresh();
      else setNote(failed);
    });
  return { busy, note, run };
}

/** "Use this design" / "Make team default" / "Use the team default" for one page. */
export function LookUse({ scope, page, design, label, failed, className, testId }: { scope: 'me' | 'team'; page: string; design: string | null; label: string; failed: string; className: string; testId: string }) {
  const { busy, note, run } = useSave(failed);
  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => run({ scope, page, design })} data-testid={testId}>
        {label}
      </button>
      {note ? (
        <span className="a3-rbad" role="alert">
          {note}
        </span>
      ) : null}
    </>
  );
}

export interface GuideOption {
  /** null = follow the team's choice (the person's own row only). */
  value: 'panel' | 'popup' | 'page' | null;
  label: string;
}

/** Where the guide opens on a computer: the team's choice or the person's own. */
export function GuideChoice({ scope, current, options, aria, failed, testId }: { scope: 'me' | 'team'; current: GuideOption['value']; options: readonly GuideOption[]; aria: string; failed: string; testId: string }) {
  const { busy, note, run } = useSave(failed);
  return (
    <div className="a3-gch">
      <div className="a3-seg" role="radiogroup" aria-label={aria} data-testid={testId}>
        {options.map((o) => {
          const on = o.value === current;
          return (
            <button key={o.value ?? 'team'} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} disabled={busy} onClick={() => !on && run({ scope, guide: o.value })} data-value={o.value ?? 'team'}>
              {o.label}
            </button>
          );
        })}
      </div>
      {note ? (
        <span className="a3-rbad" role="alert">
          {note}
        </span>
      ) : null}
    </div>
  );
}
