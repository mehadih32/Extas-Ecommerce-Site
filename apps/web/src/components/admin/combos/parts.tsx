'use client';
// Small pieces of the combo screens (demo .switch, .acb-money, .zo-pill): a switch with a 44 px tap area, the price box
// with the currency in front, and the state pill.
import type { ChangeEvent, ReactNode } from 'react';
import type { ComboState } from '@extas/combos/pure';
import { t, type Dict } from '@/lib/i18n';
import { stateTag } from './model';

export function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange(next: boolean): void; disabled?: boolean }) {
  return (
    <button type="button" className="cb-switch" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="cb-switch-track" aria-hidden="true" />
    </button>
  );
}

export function MoneyBox({ id, symbol, value, onChange, label, placeholder, disabled, invalid, testId }: { id: string; symbol: string; value: string; onChange(v: string): void; label: string; placeholder?: string; disabled?: boolean; invalid?: boolean; testId?: string }) {
  return (
    <div className="cb-money">
      <span aria-hidden="true">{symbol}</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        data-testid={testId}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </div>
  );
}

export function StatePill({ dict, state, extra }: { dict: Dict; state: ComboState; extra?: string }) {
  const s = stateTag(state);
  return (
    <span className={`cb-pill ${s.tone}`} data-state={state}>
      {t(dict, `combos.${s.key}`)}
      {extra ? ` · ${extra}` : ''}
    </span>
  );
}

export function Row({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="cb-row">
      <span className="cb-row-l">
        {label}
        {hint ? <span className="ad-mini cb-row-h">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}
