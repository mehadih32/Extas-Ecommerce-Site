// S28 · PR 693 (CN-048) — Inbox › Comments, the rules that need no database: is a phone number written in the comment
// (Bangladeshi mobile numbers, with spaces, dashes, "+88", Bengali digits), is a word of the owner's abuse list in it, does
// it ask a price or size (the owner's keyword list), and which of the desk's views a comment belongs to. Matching is on
// whole words for Latin letters and on the text for Bengali; nothing here reads a person, only the comment's own words.
/** The mark the inbox puts in front of a public comment's words (social-engagement.ts's COMMENT_MARK; a test keeps them equal). */
export const COMMENT_MARK = '(public comment)';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** The text with Bengali digits as 0-9, lower-cased. */
export function plainText(raw: string): string {
  return raw
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .toLowerCase();
}

/** Strips the "(public comment)" mark the inbox puts in front of a comment's words. */
export function commentWords(body: string | null): string {
  const b = body ?? '';
  return (b.startsWith(COMMENT_MARK) ? b.slice(COMMENT_MARK.length) : b).trim();
}

export const isCommentBody = (body: string | null): boolean => (body ?? '').startsWith(COMMENT_MARK);

/** A Bangladeshi mobile number (01XXXXXXXXX, +8801…, 8801…), the digits possibly spread by spaces, dots or dashes. */
export function hasPhoneNumber(text: string): boolean {
  const digits = plainText(text).replace(/(?<=\d)[\s.\-()]+(?=\d)/g, '').replace(/\+/g, '');
  return /(?:^|\D)(?:88)?01[3-9]\d{8}(?!\d)/.test(digits);
}

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Is one of the words in the text? A Latin word matches as a whole word; a Bengali one matches anywhere in the text. */
export function hasWord(text: string, words: readonly string[]): boolean {
  const t = plainText(text);
  return words.some((w) => {
    const x = plainText(w.trim());
    if (!x) return false;
    return /[a-z0-9]/.test(x) && !/[^\x00-\x7f]/.test(x) ? new RegExp(`(?:^|[^a-z0-9])${escapeRe(x)}(?:$|[^a-z0-9])`).test(t) : t.includes(x);
  });
}

export type CommentHide = 'phone' | 'abuse';

export interface CommentRules {
  hidePhone: boolean;
  hideAbuse: boolean;
  keywords: readonly string[];
  abuseWords: readonly string[];
}

export interface CommentVerdict {
  /** Why the comment is to be hidden, or null. A phone number comes before abuse. */
  hide: CommentHide | null;
  /** Does it ask a price or size (one of the keywords)? A comment that is hidden is never answered. */
  question: boolean;
}

export function classifyComment(text: string, rules: CommentRules): CommentVerdict {
  const hide: CommentHide | null = rules.hidePhone && hasPhoneNumber(text) ? 'phone' : rules.hideAbuse && hasWord(text, rules.abuseWords) ? 'abuse' : null;
  return { hide, question: hide === null && hasWord(text, rules.keywords) };
}

export const COMMENT_VIEWS = ['all', 'need', 'hidden', 'auto'] as const;
export type CommentView = (typeof COMMENT_VIEWS)[number];

export interface CommentState {
  hiddenAt: Date | null;
  autoRepliedAt: Date | null;
  /** Did the shop write back in this chat after the comment (a person's reply)? */
  answered: boolean;
  question: boolean;
}

/** "Need a reply": a question nobody answered, not hidden. */
export const needsReply = (c: CommentState): boolean => c.hiddenAt === null && c.autoRepliedAt === null && !c.answered && c.question;

export function inView(c: CommentState, view: CommentView): boolean {
  if (view === 'all') return true;
  if (view === 'need') return needsReply(c);
  if (view === 'hidden') return c.hiddenAt !== null;
  return c.autoRepliedAt !== null;
}
