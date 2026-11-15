'use client';
// S28 · PR 735 — "Save as PDF" on Reports › Monthly review: opens the browser's print box (choose "Save as PDF"). Nothing is sent.
// Round 3: the same button is the report toolbar's PDF and Print (its own class).
export function PrintButton({ label, testId, cls = 'a2-btn cr-tap' }: { label: string; testId: string; cls?: string }) {
  return (
    <button type="button" className={cls} onClick={() => window.print()} data-testid={testId}>
      {label}
    </button>
  );
}
