// S22 · PR 432 (Blueprint B4.7; SIM-F-012) — the rules of EXTAS AI's draft answers, without a database: what a
// customer's message is about, the body measures in it, and the draft's words filled in.
//
// SIM-F-012 found keyword drafts answering the wrong question in 6 of 10 chats ("40 polos … 4 sizes" got the exchange
// answer, "cancel korte chai" the order status, "rider 50 taka beshi chailo" "Delivered"). The fix is the order the
// questions are decided in, first match wins: cancel > complaint (overcharge, wrong item, damage, colour) > late >
// bulk > exchange > size > order status > greeting > unknown. A bulk count ("40 polos", "৪০টা") outranks the word
// "size", and an exchange outranks it too ("size boro hoyeche, exchange"). Bengali digits are read as digits.
// Every word list is the store's own (`support.draftKeywords`), so a new phrase is a setting, not a code change.
import type { DraftComplaint, DraftIntent, DraftText, DraftWordList, SupportDraftKeywordsSettings } from '@extas/settings';

/** The questions, texts and word lists, and the bulk count's bounds, for the settings cards. */
export { DRAFT_BULK_PIECES, DRAFT_INTENTS, DRAFT_TEXTS, DRAFT_WORD_LISTS } from '@extas/settings';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Lower case, Bengali digits as 0–9, one space between words. */
export function normaliseText(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether the text is written in Bengali letters (not Banglish in Latin letters). */
export const isBengaliScript = (text: string): boolean => /[অ-হৎড়-য়]/.test(text);

/** One comma-separated word list, cleaned. */
export const wordsOf = (list: string): string[] => [...new Set(list.split(',').map((w) => normaliseText(w)).filter(Boolean))];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LATIN = /^[a-z0-9 '-]+$/;

/** Whether the (normalised) text holds one of the words: a Latin word whole, a Bengali word anywhere. */
export function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => (LATIN.test(w) ? new RegExp(`(^|[^a-z0-9])${escape(w)}($|[^a-z0-9])`).test(text) : text.includes(w)));
}

/** The largest count of pieces in the text ("40 polos", "৪০টা", "40 ta shirt"), or 0. */
export function piecesIn(text: string, pieces: string[]): number {
  let most = 0;
  for (const m of text.matchAll(/(\d+)\s*([^\s\d,.;:!?]+)/g)) {
    const n = Number(m[1]);
    const next = m[2]!;
    if (pieces.some((p) => next === p || (!LATIN.test(p) && next.startsWith(p)))) most = Math.max(most, n);
  }
  return most;
}

/** Height (inches) and weight (kg) from the text ("৫ ফুট ৬, ওজন ৬৫", "5'6 65kg", "170 cm 70 kg"), or null. */
export function bodyIn(text: string): { heightIn: number; weightKg: number } | null {
  const t = normaliseText(text);
  let heightIn: number | null = null;
  const ft = t.match(/(\d)\s*(?:ft|feet|foot|fit|ফুট|'|’)\s*(\d{1,2})?/);
  if (ft) heightIn = Number(ft[1]) * 12 + (ft[2] ? Math.min(11, Number(ft[2])) : 0);
  const cm = t.match(/(\d{3})\s*(?:cm|সেমি)/);
  if (heightIn == null && cm) heightIn = Math.round(Number(cm[1]) / 2.54);
  const kg = t.match(/(\d{2,3})\s*(?:kg|kgs|kilo|কেজি)/) ?? t.match(/(?:weight|ojon|ওজন)\D{0,6}(\d{2,3})/);
  const weightKg = kg ? Number(kg[1]) : null;
  if (heightIn == null || weightKg == null || heightIn < 48 || heightIn > 90 || weightKg < 25 || weightKg > 250) return null;
  return { heightIn, weightKg };
}

export interface DraftKind {
  intent: DraftIntent;
  complaint: DraftComplaint | null;
}

const COMPLAINTS: readonly DraftComplaint[] = ['overcharge', 'wrong', 'damage', 'fade'];

/** What the message is about, first match wins (SIM-F-012's order). */
export function classifyMessage(text: string, lists: SupportDraftKeywordsSettings, bulkPieces: number): DraftKind {
  const t = normaliseText(text);
  const w = (k: DraftWordList) => wordsOf(lists[k]);
  if (hasAny(t, w('cancel'))) return { intent: 'cancel', complaint: null };
  for (const c of COMPLAINTS) if (hasAny(t, w(c))) return { intent: 'complaint', complaint: c };
  if (hasAny(t, w('late'))) return { intent: 'late', complaint: null };
  if (hasAny(t, w('bulk')) || piecesIn(t, w('pieces')) >= bulkPieces) return { intent: 'bulk', complaint: null };
  if (hasAny(t, w('exchange'))) return { intent: 'exchange', complaint: null };
  if (hasAny(t, w('size')) || bodyIn(t)) return { intent: 'size', complaint: null };
  if (hasAny(t, w('status'))) return { intent: 'status', complaint: null };
  if (hasAny(t, w('greeting'))) return { intent: 'greeting', complaint: null };
  return { intent: 'unknown', complaint: null };
}

/** The draft text that answers this kind, given what is known (no order → ask for it; no size → ask the measures). */
export function draftTextKey(k: DraftKind, f: { order: { status: string; parcel: boolean } | null; late: boolean; size: string | null }): DraftText {
  const needsOrder = k.intent === 'cancel' || k.intent === 'complaint' || k.intent === 'late' || k.intent === 'exchange' || k.intent === 'status';
  if (needsOrder && !f.order) return 'noOrder';
  if (k.intent === 'complaint') return k.complaint!;
  if (k.intent === 'size') return f.size ? 'size' : 'sizeAsk';
  if (k.intent === 'status') {
    const s = f.order!.status;
    if (s === 'CANCELLED') return 'statusCancelled';
    if (s === 'DELIVERED' || s === 'PARTIALLY_DELIVERED') return 'statusDelivered';
    if (f.late) return 'late';
    return f.order!.parcel ? 'statusShipped' : 'statusPreparing';
  }
  if (k.intent === 'cancel' || k.intent === 'late' || k.intent === 'bulk' || k.intent === 'exchange' || k.intent === 'greeting') return k.intent;
  return 'unknown';
}

/** A draft text with its {tokens} filled ("—" for a fact not known), spaces tidied. */
export function fillDraft(text: string, values: Readonly<Record<string, string | null | undefined>>): string {
  return text
    .replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_, k: string) => values[k] ?? '—')
    .replace(/\s+([,.।?!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
