// PR 627 (CN-036, LUMEN-SPEC §3 item 7) — the empty state: a calm card saying there is nothing waiting ("All caught
// up"), or that a list has nothing yet, with at most one clear next step. The words come from the page (its own
// dictionary), so the same card says the right thing on every page.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import type { ShellIconName } from '@/lib/admin-shell/icons';

export function EmptyState({ title, text, icon = 'check', action, tone = 'ok', testId = 'lm-empty' }: { title: string; text?: ReactNode; icon?: ShellIconName; action?: { label: string; href: string }; tone?: 'ok' | 'calm'; testId?: string }) {
  return (
    <div className={`lm-empty ${tone}`} data-testid={testId}>
      <span className="lm-empty-i" aria-hidden="true">
        <ShellIcon name={icon} size={26} />
      </span>
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
      {action ? (
        <Link className="lm-btn" href={action.href}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
