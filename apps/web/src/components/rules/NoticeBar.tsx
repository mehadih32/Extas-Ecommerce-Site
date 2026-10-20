// S10 · PR 216 — the announcement bars, banners and page notes of one place, as plain markup: the server already chose
// the switched-on ones for the place, in order, with their texts filled in from the rules (lib/rules-public.ts
// `placeNotices`). Pop-ups are left to RulePopup. No styling of its own: the storefront owner (S02) passes classes.
import Link from 'next/link';
import type { PublicNotice } from '@extas/rules';

export function NoticeBar({ notices, kinds = ['bar', 'banner', 'inline'], className, itemClassName, ctaClassName }: { notices: readonly PublicNotice[]; kinds?: readonly string[]; className?: string; itemClassName?: string; ctaClassName?: string }) {
  const shown = notices.filter((n) => kinds.includes(n.kind));
  if (!shown.length) return null;
  return (
    <div className={className} data-notices="">
      {shown.map((n) => (
        <div key={n.id} className={itemClassName} data-notice={n.key ?? n.id} data-kind={n.kind} data-position={n.position ?? undefined} role={n.kind === 'bar' ? 'region' : undefined} aria-label={n.kind === 'bar' ? (n.title ?? n.content) : undefined}>
          {n.title ? <strong>{n.title} </strong> : null}
          <span>{n.content}</span>
          {n.cta ? (
            <>
              {' '}
              <Link className={ctaClassName} href={n.cta.href}>
                {n.cta.label}
              </Link>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
