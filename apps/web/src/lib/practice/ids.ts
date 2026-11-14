// PR 725 — the practice world's one id maker (own file so seed.ts and demo-extras.ts do not import each other).
import { createHash } from 'node:crypto';

/** A uuid made from the record's own key: the same key is always the same id. */
export function practiceId(key: string): string {
  const h = createHash('sha1').update(`extas-practice:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
