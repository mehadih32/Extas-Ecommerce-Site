// PR 425 — the support core's rules without a database (the screens and the tests use them): the states and views of a
// conversation, what the log records, the customer's number as the team may see it, a message's first words for the
// list, and what kind of file a file really is (read from its first bytes, never from its name).

/** OPEN: the customer waits for the shop. WAITING: the shop answered and waits for the customer. SOLVED: done. */
export const CONVERSATION_STATUSES = ['OPEN', 'WAITING', 'SOLVED'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** The inbox's views (docs/ADMIN-ARCHITECTURE.md §4.7: All · Open · Waiting · Solved · Mine; plus "Not taken"). */
export const INBOX_VIEWS = ['open', 'waiting', 'mine', 'unassigned', 'solved', 'all'] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

/** IN: from the customer. OUT: the shop's reply. NOTE: an internal note, never sent and never shown to the customer. */
export const MESSAGE_DIRECTIONS = ['IN', 'OUT', 'NOTE'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

/** A reply's delivery: QUEUED while the channel is asked, then SENT, NOT_SENT (no channel yet) or FAILED. */
export const DELIVERY_STATES = ['QUEUED', 'SENT', 'NOT_SENT', 'FAILED'] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

/** What the who-did-what log records (ConversationEvent.kind). */
export const EVENT_KINDS = [
  'RECEIVED',
  'REPLIED',
  'NOTED',
  'ASSIGNED',
  'UNASSIGNED',
  'STATUS',
  'REOPENED',
  // PR 427: who is writing — a number found, a customer linked, one person across channels, and the team's corrections
  'IDENTITY_PHONE',
  'IDENTITY_CUSTOMER',
  'IDENTITY_MERGED',
  'IDENTITY_UNLINKED',
  'IDENTITY_SPLIT',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** A file's state: PENDING while a channel's copy waits to be saved to our storage (B4.8), STORED once we have it. */
export const FILE_STATES = ['PENDING', 'STORED'] as const;

/** The first words of a message for the list: spaces folded, cut at `max` characters with "…". */
export function previewOf(text: string | null | undefined, max: number): string | null {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…` : s;
}

/** How many characters of a message the list and the subject show. */
export const PREVIEW_CHARS = 120;
export const SUBJECT_CHARS = 80;

export interface SniffedFile {
  /** The kind the attachment settings switch (support.attachments.kinds). */
  kind: 'image' | 'video' | 'pdf';
  /** The media library's kind. */
  mediaKind: 'IMAGE' | 'VIDEO' | 'PDF';
  contentType: string;
  extension: string;
}

const starts = (b: Uint8Array, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);
const ascii = (b: Uint8Array, at: number, len: number) => (b.length >= at + len ? String.fromCharCode(...b.subarray(at, at + len)) : '');

/** What the file really is, from its first bytes: a JPEG, PNG, WebP or GIF picture, an MP4, MOV or WebM video, a PDF. */
export function sniffFile(b: Uint8Array): SniffedFile | null {
  if (starts(b, [0xff, 0xd8, 0xff])) return { kind: 'image', mediaKind: 'IMAGE', contentType: 'image/jpeg', extension: 'jpg' };
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mediaKind: 'IMAGE', contentType: 'image/png', extension: 'png' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return { kind: 'image', mediaKind: 'IMAGE', contentType: 'image/webp', extension: 'webp' };
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return { kind: 'image', mediaKind: 'IMAGE', contentType: 'image/gif', extension: 'gif' };
  if (ascii(b, 0, 5) === '%PDF-') return { kind: 'pdf', mediaKind: 'PDF', contentType: 'application/pdf', extension: 'pdf' };
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (brand === 'qt  ') return { kind: 'video', mediaKind: 'VIDEO', contentType: 'video/quicktime', extension: 'mov' };
    if (/^(heic|heix|mif1|msf1|avif)$/.test(brand)) return null;
    return { kind: 'video', mediaKind: 'VIDEO', contentType: 'video/mp4', extension: 'mp4' };
  }
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: 'video', mediaKind: 'VIDEO', contentType: 'video/webm', extension: 'webm' };
  return null;
}

/** The attachment-settings kind of a stored file's media kind (null: a kind the team may not attach). */
export function fileKindOf(mediaKind: string): SniffedFile['kind'] | null {
  return mediaKind === 'IMAGE' ? 'image' : mediaKind === 'VIDEO' ? 'video' : mediaKind === 'PDF' ? 'pdf' : null;
}

/** A file name safe to show and to offer for download: no path, no control characters, at most 120 characters. */
export function cleanFileName(name: string | null | undefined): string | null {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const s = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, 120);
  return s || null;
}

// PR 427 — who is writing: a Bangladeshi mobile number found in a chat's words.
export * from './identity-pure';
