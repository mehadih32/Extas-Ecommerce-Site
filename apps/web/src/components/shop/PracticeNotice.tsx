// PR 725 (CN-049) — the small "Practice shop" notice on the storefront while practice mode is on. Its words are the owner's
// settings (`practice.notice`, English and Bengali) and he can hide it there. Nothing is drawn when practice mode is off.
// A server component: no script, no request of its own; it shows in the page's own language.
export function PracticeNotice({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div role="note" data-testid="practice-notice" style={{ background: 'color-mix(in srgb, currentColor 8%, transparent)', fontSize: 12, lineHeight: 1.4, padding: '4px 16px', textAlign: 'center' }}>
      {text}
    </div>
  );
}
