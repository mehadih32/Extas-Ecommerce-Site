// PR 141, 152 — what a command button needs in the browser, worked out on the server (client-safe types only): the
// route, the order's version, the dialog's title, the "what will happen" lines, the fields (a reason from the owner's
// list, a note, the courier's answer), and the words for success. The server builds a spec only for a command the
// order service says is open now AND the person's keys allow (lib/admin-orders/detail.ts); the service checks both again.
import type { ShellIconName } from '../admin-shell/icons';

export interface FieldOption {
  value: string;
  label: string;
  /** This choice needs the note (the owner's "Other"). */
  noteRequired?: boolean;
}

export interface FieldSpec {
  /** The body key it is sent as. */
  name: string;
  kind: 'select' | 'text' | 'textarea' | 'checks';
  label: string;
  options?: FieldOption[];
  /** The starting value (a select's first choice, a flag list's current flags). */
  value?: string | string[];
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** A textarea that becomes required when the chosen option of `noteFor` needs a note. */
  noteFor?: string;
  /** The label while the note is needed (the chosen reason asks for one). */
  labelNeeded?: string;
}

export type ButtonTone = '' | 'pri' | 'bad' | 'badf' | 'ghost';

export interface CommandSpec {
  /** Stable id (data-testid and the `?do=` deep link). */
  id: string;
  label: string;
  icon?: ShellIconName;
  tone?: ButtonTone;
  url: string;
  /** The order's version the screen shows ([ver]); null for what does not take one (a note, a review decision). */
  version: number | null;
  /** Fixed body values (the courier's answer, a review decision). */
  fixed?: Record<string, string>;
  title: string;
  sub?: string;
  effects: string[];
  fields: FieldSpec[];
  ok: string;
  okTone: 'pri' | 'badf';
  /** Said when it worked. */
  done: string;
  /** Said when the command recorded refund requests (a paid order's cancel): `{n}` is how many. */
  doneRefund?: string;
}

/** The dialogs' shared words (one set per page). */
export interface CommandTexts {
  cancel: string;
  close: string;
  willHappen: string;
  stale: string;
  working: string;
  required: string;
  /** `orders.err.<CODE>` words, by code (and `other`). */
  errors: Record<string, string>;
}

/** The body a dialog sends: the fixed values, the fields (empty ones left out), and the version. */
export function bodyOf(spec: CommandSpec, values: Record<string, string | string[]>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(spec.fixed ?? {}) };
  for (const f of spec.fields) {
    const v = values[f.name];
    if (Array.isArray(v)) out[f.name] = v;
    else if (typeof v === 'string' && v.trim()) out[f.name] = v.trim();
  }
  if (spec.version !== null) out.version = spec.version;
  return out;
}

/** Does the chosen option of `f.noteFor` need this note now? */
export function noteNeeded(spec: CommandSpec, values: Record<string, string | string[]>, f: FieldSpec): boolean {
  if (!f.noteFor) return false;
  const chosen = values[f.noteFor];
  return !!spec.fields.find((x) => x.name === f.noteFor)?.options?.find((o) => o.value === chosen)?.noteRequired;
}

/** The fields still missing (a required one, or the note an "Other" reason needs). */
export function missingOf(spec: CommandSpec, values: Record<string, string | string[]>): string[] {
  const filled = (name: string) => {
    const v = values[name];
    return Array.isArray(v) ? true : typeof v === 'string' && v.trim() !== '';
  };
  return spec.fields
    .filter((f) => {
      if (f.required && !filled(f.name)) return true;
      return noteNeeded(spec, values, f) && !filled(f.name);
    })
    .map((f) => f.name);
}

/** A field's starting value. */
export const startOf = (f: FieldSpec): string | string[] => f.value ?? (f.kind === 'checks' ? [] : f.kind === 'select' && f.options?.length ? f.options[0]!.value : '');
