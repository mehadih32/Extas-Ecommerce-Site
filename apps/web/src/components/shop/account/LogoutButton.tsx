'use client';
// PR 130 — "Log out": ends this browser's session (POST /api/account/logout) and goes home.
import { useState } from 'react';

export function LogoutButton({ label, lang, className = 'btn btn-ghost' }: { label: string; lang: 'en' | 'bn'; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      aria-busy={busy || undefined}
      data-testid="account-logout"
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch('/api/account/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang }) });
          const data = (await res.json().catch(() => ({}))) as { next?: string };
          window.location.assign(data.next ?? '/');
        } catch {
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}
