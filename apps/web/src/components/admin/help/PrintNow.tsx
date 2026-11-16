'use client';
// PR 937 — the Site manual's "Download PDF": the whole manual is drawn on one page and the browser's print box opens, where
// "Save as PDF" makes the file (no PDF program runs on the server). Nothing is stored or sent.
import { useEffect } from 'react';

export function PrintNow() {
  useEffect(() => {
    const id = window.setTimeout(() => window.print(), 600); // hardcode-ok: a short wait so the pictures can draw before the print box opens
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
