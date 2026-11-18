'use client';
// PR 1101 (owner, 18 Nov 2026; prototype v5 m-home.js `hm-design`): the Home's design switcher right on the page, as the
// prototype draws it under the greeting: "Design  A · Command | B · Calm | C · Classic" and "Pick one design — the final
// admin keeps only your choice." A press saves the person's own design for Home (PUT /api/admin/look, scope "me", the
// same call as the "…" menu) while the team allows a personal choice (`admin.look.perPerson`); otherwise it shows the
// design as a preview (?design=), which is never saved. The fourth design (the older overview, A) stays in the "…" menu.
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';

export interface DesignSwitchProps {
  page: string;
  /** The design shown now (a real design key). */
  current: string;
  perPerson: boolean;
  /** The prototype's three, in its order: the real design key and its words ("A · Command"). */
  options: { key: string; label: string }[];
  labels: { design: string; note: string; saved: string; failed: string };
}

/** `children`: the page's own extra switch (Overview / Money & marketing), kept beside the designs so the head's right side
 *  holds only the dates, as in the prototype. */
export function DesignSwitch(p: DesignSwitchProps & { children?: ReactNode }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const path = usePathname() ?? '/admin';
  const search = useSearchParams();
  const previewHref = (key: string) => {
    const q = new URLSearchParams(search?.toString() ?? '');
    q.set('home', '1');
    q.set('design', key);
    return `${path}?${q.toString()}`;
  };
  const choose = (key: string) =>
    start(async () => {
      const res = await fetch('/api/admin/look', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'me', page: p.page, design: key }),
      }).catch(() => null);
      if (!res?.ok) {
        showToast({ text: p.labels.failed, tone: 'bad' });
        return;
      }
      showToast({ text: p.labels.saved, tone: 'ok' });
      if (search?.get('design')) {
        const q = new URLSearchParams(search.toString());
        q.delete('design');
        router.replace(q.size ? `${path}?${q.toString()}` : path, { scroll: false });
      }
      router.refresh();
    });
  return (
    <div className="a3-dsw" data-testid="dash-design-switch">
      <div className="a3-dsw-l">
        <span>{p.labels.design}</span>
        <div className="a3-seg" role="group" aria-label={p.labels.design}>
          {p.options.map((o) =>
            p.perPerson ? (
              <button key={o.key} type="button" className={o.key === p.current ? 'on' : ''} aria-pressed={o.key === p.current} disabled={busy} onClick={() => o.key !== p.current && choose(o.key)}>
                {o.label}
              </button>
            ) : (
              <Link key={o.key} className={o.key === p.current ? 'on' : ''} aria-current={o.key === p.current ? 'true' : undefined} href={previewHref(o.key)} scroll={false}>
                {o.label}
              </Link>
            ),
          )}
        </div>
        {p.children}
      </div>
      <span className="a3-dsw-n">{p.labels.note}</span>
    </div>
  );
}
