'use client';
// PR 1066 — a button that opens the Admin map overlay on the same page (prototype v5 `#open-map`), for the Help pages.
import type { ReactNode } from 'react';
import { openMap } from '@/components/admin/shell/events';

export function OpenMapButton({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <button type="button" className="a2-btn" onClick={openMap} data-testid={testId}>
      {children}
    </button>
  );
}
