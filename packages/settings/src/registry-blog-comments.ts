// S12 · PR 251 (register "Comment handling, or the decision to run without comments"; BACKEND-ARCHITECTURE WEB-03
// "More options: … comments") — registry version 250, lane C.
//   `blog.comments` — readers' comments under a journal article. Off as it ships: that is the decision to run without
//   comments, and the article page shows no comment part at all. On: a reader (signed in only, as it ships, or anyone
//   with a name) may leave a comment of at most `maxChars` characters, at most `perDay` in a day; every comment waits
//   for a person with `blog.publish` to show it (Website › Blog & journal › Comments) — nothing is ever shown by itself.
//   Under an article the newest `shown` comments that were shown appear. A comment is hidden, never deleted.
import { z } from 'zod';
import { setting } from './define';

const V251 = 250;

/** Who may leave a comment while comments are on. */
export const BLOG_COMMENT_WHO = ['signedIn', 'anyone'] as const;
export type BlogCommentWho = (typeof BLOG_COMMENT_WHO)[number];

export const blogCommentsSchema = z
  .object({
    /** Readers may leave comments under the journal's articles (each waits for a person to show it). */
    on: z.boolean(),
    /** `signedIn`: only a signed-in customer; `anyone`: a guest too, with a name. */
    who: z.enum(BLOG_COMMENT_WHO),
    /** The longest comment, in characters. */
    maxChars: z.int().min(40).max(2000),
    /** How many comments one person may leave in a day (the last 24 hours). */
    perDay: z.int().min(1).max(50),
    /** How many shown comments an article page lists (the newest first). */
    shown: z.int().min(1).max(100),
  })
  .strict();
export type BlogCommentsSettings = z.output<typeof blogCommentsSchema>;

export const BLOG_COMMENTS_DEFAULT: BlogCommentsSettings = { on: false, who: 'signedIn', maxChars: 600, perDay: 3, shown: 20 };

export const blogCommentSettings = {
  'blog.comments': setting({
    scope: 'store',
    schema: blogCommentsSchema,
    default: BLOG_COMMENTS_DEFAULT,
    valueType: 'JSON',
    group: 'blog',
    labelKey: 'blog.comments.label',
    helpKey: 'blog.comments.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 80,
    version: V251,
  }),
};
