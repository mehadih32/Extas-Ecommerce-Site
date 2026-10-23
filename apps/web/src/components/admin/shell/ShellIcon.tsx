// PR 12 — one line icon of the new admin (the demo's a2i): 24 × 24 paths, stroked with the text colour.
import { SHELL_ICONS, type ShellIconName } from '@/lib/admin-shell/icons';

export function ShellIcon({ name, size = 18, stroke = 1.7 }: { name: ShellIconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={SHELL_ICONS[name]} />
    </svg>
  );
}
