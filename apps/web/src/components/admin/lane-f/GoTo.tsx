'use client';
// Parity round 3, lane F6 · PR 866 — a button that opens the folded part of the page holding a form (every <details> around it) and
// scrolls to it, so the prototype's "New job" and "Start" land on the real form below.
export function GoTo({ target, label, className = 'a2-btn', testId }: { target: string; label: string; className?: string; testId?: string }) {
  return (
    <button
      type="button"
      className={className}
      data-testid={testId}
      onClick={() => {
        const el = document.getElementById(target);
        if (!el) return;
        for (let n: HTMLElement | null = el; n; n = n.parentElement) if (n instanceof HTMLDetailsElement) n.open = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
    >
      {label}
    </button>
  );
}
