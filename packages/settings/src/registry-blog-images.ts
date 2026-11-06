// S12 · PR 547 (register "Image sourcing for the blog — the owner's own product photographs first, then free-licence
// libraries … AI generation asks permission every time … Nothing is ever taken from Google image search"; Blueprint
// C11.6) — registry version 252, lane C.
//   `blog.images` — the journal articles' main photo. The picker (Website › Blog & journal › an article › Main photo)
//   always offers the shop's own pictures in a fixed order: the photographs of the article's own products first, then
//   the photo library. Off as it ships: the shop's article pages show no main photo. `studio`: pictures made in the
//   studio (AI-made, in the library) may be picked too — off; when picked they are always labelled "Studio image" under
//   the photo and are never evidence for a fit or care claim. `perSource`: how many pictures each source offers.
//   There is no "picture from a web address" at all, so nothing can come from an image search; free-licence libraries
//   arrive with their own keys (Keys & connections), and AI pictures stay with the AI Center, asking every time.
import { z } from 'zod';
import { setting } from './define';

const V547 = 252;

export const blogImagesSchema = z
  .object({
    /** The shop's article pages show the article's main photo. */
    show: z.boolean(),
    /** Studio (AI-made) pictures from the library may be picked, always labelled. */
    studio: z.boolean(),
    /** How many pictures each source offers in the picker. */
    perSource: z.int().min(4).max(60),
  })
  .strict();
export type BlogImagesSettings = z.output<typeof blogImagesSchema>;

export const BLOG_IMAGES_DEFAULT: BlogImagesSettings = { show: false, studio: false, perSource: 24 };

export const blogImageSettings = {
  'blog.images': setting({
    scope: 'store',
    schema: blogImagesSchema,
    default: BLOG_IMAGES_DEFAULT,
    valueType: 'JSON',
    group: 'blog',
    labelKey: 'blog.images.label',
    helpKey: 'blog.images.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 85,
    version: V547,
  }),
};
