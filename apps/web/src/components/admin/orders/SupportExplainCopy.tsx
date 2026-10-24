'use client';
// PR 566 — "Copy" beside the words for the customer (support explanation panel): puts the text on the clipboard for a
// chat, and says "Copied" for a moment. Without a clipboard (an old browser, no permission) the text stays selectable.
import { useEffect, useState } from 'react';

export function SupportExplainCopy({ text, label, done, testId }: { text: string; label: string; done: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      className="a2-btn sm"
      style={{ minWidth: 44, justifyContent: 'center' }}
      data-testid={testId}
      aria-live="polite"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
    >
      {copied ? done : label}
    </button>
  );
}
