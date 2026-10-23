'use client';
// PR 107 — the test page's "Fill a sample bag" button (test servers only): the same fill the gates use, then the bag.
import { useState } from 'react';
import { showToast } from '../toast';

export function TryFill({ label, bagHref, error }: { label: string; bagHref: string; error: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary mt12"
      disabled={busy}
      data-testid="bag-try-fill"
      onClick={async (ev) => {
        const el = ev.currentTarget;
        setBusy(true);
        const r = await fetch('/api/bag/try', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
        if (r?.ok) window.location.assign(bagHref);
        else {
          showToast(el, error);
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}
