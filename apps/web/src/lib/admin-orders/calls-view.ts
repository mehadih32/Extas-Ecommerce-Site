// S06 · PR 545 — the call queue on the admin screens, without a database: one row per call task (the reason in the
// person's language, the order it is about, who to phone, how long it has waited or what the last try found, the notes
// with each outcome's name) and the "Record call" dialog (the owner's outcomes, a note; it posts to
// /api/admin/orders/calls/<task>). The dialog is built only for an open call and a person with `orders.confirm`; the
// order service checks both again. The reason and dialog words are the orders words (`orders.call.*`), so the order
// page's new-customer band opens the same dialog.
import type * as od from '@extas/orders';
import type { CallOutcomes } from '@extas/settings';
import { t, type Dict } from '../i18n';
import type { CommandSpec } from './spec';

export const CALLS_API = '/api/admin/orders/calls';

export interface CallsFormat {
  /** `cl.<key>` words (the page's own). */
  w: (key: string, vars?: Record<string, string | number>) => string;
  /** "3h", "2d" — how long ago. */
  age: (at: Date) => string;
  when: (at: Date) => string;
  lang: 'en' | 'bn';
}

export interface CallLine {
  taskId: string;
  reason: string;
  reasonLabel: string;
  /** The order's page, or null for a call with no order. */
  href: string | null;
  number: string | null;
  name: string;
  phone: string | null;
  /** "Waiting 3h", "Tried · No answer", or for a made call "Spoke — all fine · 31 Oct 14:02". */
  state: string;
  tone: 'warn' | 'mute' | 'ok';
  notes: string[];
  record: CommandSpec | null;
}

/** The reason in the person's language (an unknown reason by its code). */
export function reasonLabel(d: Dict, reason: string): string {
  const k = `orders.call.reason.${reason}`;
  const s = t(d, k);
  return s === k ? reason : s;
}

const nameOf = (o: CallOutcomes[number], lang: 'en' | 'bn') => (lang === 'bn' ? o.bn || o.en : o.en);

/** An outcome's name from the owner's list (an outcome no longer on it by its code). */
export function outcomeLabel(outcomes: CallOutcomes, key: string | null, lang: 'en' | 'bn'): string {
  if (!key) return '';
  const o = outcomes.find((x) => x.key === key);
  return o ? nameOf(o, lang) : key;
}

/** A note line as the task keeps it ("NO_ANSWER: …") with the outcome's name in place of its code. */
export function noteLine(outcomes: CallOutcomes, line: string, lang: 'en' | 'bn'): string {
  const m = /^([A-Z][A-Z0-9_]{1,39})(?::\s*(.*))?$/.exec(line);
  const o = m ? outcomes.find((x) => x.key === m[1]) : undefined;
  if (!m || !o) return line;
  return m[2] ? `${nameOf(o, lang)}: ${m[2]}` : nameOf(o, lang);
}

/** Who the dialog is about. */
export interface CallWho {
  taskId: string;
  number: string | null;
  name: string | null;
  phone: string | null;
  reason: string;
}

/** The dialog that records what a call found. */
export function recordSpec(d: Dict, who: CallWho, outcomes: CallOutcomes, lang: 'en' | 'bn'): CommandSpec {
  const w = (k: string, vars?: Record<string, string>) => t(d, `orders.call.record.${k}`, vars);
  const closes = outcomes.filter((o) => o.done).map((o) => nameOf(o, lang));
  return {
    id: `record-${who.taskId}`,
    label: w('label'),
    icon: 'phone',
    tone: 'pri',
    url: `${CALLS_API}/${who.taskId}`,
    version: null,
    title: w('title'),
    sub: who.number ? w('sub', { number: who.number, name: who.name ?? '—', phone: who.phone ?? '—' }) : reasonLabel(d, who.reason),
    effects: [...(closes.length ? [w('closes', { list: closes.join(', ') })] : []), w('nothingElse')],
    fields: [
      { name: 'outcome', kind: 'select', label: w('outcome'), required: true, options: outcomes.map((o) => ({ value: o.key, label: nameOf(o, lang) })), value: outcomes[0]?.key ?? '' },
      { name: 'note', kind: 'textarea', label: w('note'), placeholder: w('notePh'), maxLength: 500 },
    ],
    ok: w('ok'),
    okTone: 'pri',
    done: w('done'),
  };
}

const OPEN = new Set(['OPEN', 'IN_PROGRESS']);

/** The rows of the list. */
export function callLines(d: Dict, rows: readonly od.CallRow[], outcomes: CallOutcomes, f: CallsFormat, canRecord: boolean): CallLine[] {
  return rows.map((r) => {
    const open = OPEN.has(r.status);
    const last = outcomeLabel(outcomes, r.outcome, f.lang);
    const state = !open ? f.w('closedAt', { outcome: last || r.status, at: r.closedAt ? f.when(r.closedAt) : '—' }) : r.outcome ? f.w('tried', { outcome: last }) : f.w('waiting', { age: f.age(r.createdAt) });
    const who: CallWho = { taskId: r.taskId, number: r.order?.number ?? null, name: r.order?.customerName ?? null, phone: r.order?.phone ?? null, reason: r.reason };
    return {
      taskId: r.taskId,
      reason: r.reason,
      reasonLabel: reasonLabel(d, r.reason),
      href: r.order ? `/admin/orders/${r.order.id}` : null,
      number: r.order?.number ?? null,
      name: r.order?.customerName ?? f.w('noOrder'),
      phone: r.order?.phone ?? null,
      state,
      tone: !open ? 'ok' : r.outcome ? 'mute' : 'warn',
      notes: (r.notes ?? '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => noteLine(outcomes, x, f.lang)),
      record: open && canRecord ? recordSpec(d, who, outcomes, f.lang) : null,
    };
  });
}
