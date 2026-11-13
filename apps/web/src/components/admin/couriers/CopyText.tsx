'use client';
// S28 · PR 674 — Courier 360 › Messages: one text with a "Copy" button that puts it on the clipboard (to paste into the
// courier's own panel, phone or chat). Nothing is sent from here.
import { useState } from 'react';

export function CopyText({ text, label, done, testId }: { text: string; label: string; done: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const go = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no clipboard here: the text is on the screen to select by hand
    }
  };
  return (
    <button type="button" className="a2-btn sm" onClick={go} data-testid={testId} aria-live="polite">
      {copied ? done : label}
    </button>
  );
}
