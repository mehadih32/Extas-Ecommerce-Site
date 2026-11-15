'use client';
// S28 · PR 735 — "Save as PDF" on Reports › Monthly review: opens the browser's print box (choose "Save as PDF"). Nothing is sent.
export function PrintButton({ label, testId }: { label: string; testId: string }) {
  return (
    <button type="button" className="a2-btn cr-tap" onClick={() => window.print()} data-testid={testId}>
      {label}
    </button>
  );
}
