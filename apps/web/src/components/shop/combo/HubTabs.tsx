'use client';
// PR 103 — the landing page's season tabs (demo ca_L3 ca-hubtabs): every season's rows are drawn on the server, and a
// tap only shows that season's rows and hides the others. A tiny part: no other code runs when the page opens.
import { useState } from 'react';

export function HubTabs({ tabs, label, initial }: { tabs: { key: string; label: string }[]; label: string; initial: string }) {
  const [on, setOn] = useState(initial);
  const pick = (key: string) => {
    setOn(key);
    for (const el of document.querySelectorAll<HTMLElement>('[data-season-panel]')) el.hidden = el.dataset.seasonPanel !== key;
  };
  return (
    <div className="ca-hubtabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" className={`ca-hubtab${t.key === on ? ' on' : ''}`} aria-selected={t.key === on} onClick={() => pick(t.key)} data-testid="ca-hubtab">
          {t.label}
        </button>
      ))}
    </div>
  );
}
