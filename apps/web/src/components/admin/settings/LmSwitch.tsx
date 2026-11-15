'use client';
// PR 815-817 (lane E3) — the Lumen switch (`lm-sw`) as a controlled button, for the Settings pages that save a choice at once
// (Telegram control, Security). The state is the caller's; a tap only asks for the opposite.
export function LmSwitch({ on, label, onFlip, testId, disabled }: { on: boolean; label: string; onFlip: (next: boolean) => void; testId?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`lm-sw${on ? ' on' : ''}`} onClick={() => onFlip(!on)} disabled={disabled} data-testid={testId}>
      <span aria-hidden="true" />
    </button>
  );
}
