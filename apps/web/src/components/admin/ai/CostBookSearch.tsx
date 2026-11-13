'use client';
// S15 · PR 312 (C2.1 — "searchable, so the owner can look up 'image generation' or 'support reply' whenever he
// wonders") — a plain text box that filters the Cost Book's own rows in the browser, against each row's own
// `data-cb-text` (already lower-cased server-side: English and Bengali name, section, description). No network
// round trip, no server state; the empty-query state shows every row, same as `searchJobs` (cost-book.ts).
import { useState } from 'react';

export function CostBookSearch({ label, placeholder, noneText, rowsId, noneId }: { label: string; placeholder: string; noneText: string; rowsId: string; noneId: string }) {
  const [q, setQ] = useState('');

  const filter = (next: string) => {
    setQ(next);
    const needle = next.trim().toLowerCase();
    const root = document.getElementById(rowsId);
    if (!root) return;
    let shown = 0;
    for (const row of root.querySelectorAll<HTMLElement>('[data-cb-text]')) {
      const hit = !needle || (row.dataset.cbText ?? '').includes(needle);
      row.style.display = hit ? '' : 'none';
      if (hit) shown += 1;
    }
    const none = document.getElementById(noneId);
    if (none) none.style.display = shown ? 'none' : '';
  };

  return (
    <div className="cb-search">
      <input type="search" className="a2-inp" aria-label={label} placeholder={placeholder} value={q} autoComplete="off" data-testid="cb-search" onChange={(e) => filter(e.target.value)} />
      <p className="a2-xs a2-mute cb-search-none" id={noneId} style={{ display: 'none' }}>
        {noneText}
      </p>
    </div>
  );
}
