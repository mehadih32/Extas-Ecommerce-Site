// PR 22, 23, 24, 25, 37 — the image pipeline and the media library (Blueprint A2.9.7, C7.11; owner server spec §3,
// 19 Oct 23:33). Every size, format, quality, the 4:5 ratio, upload limits, the photo minimum and the watermark live
// here, never in code. Labels: messages/media.<lang>.json. Registry version 6.
//
// The watermark text is the owner's brand (owner data, PR 509): it ships empty and falls back to the store name.
import { z } from 'zod';
import { setting } from './define';
import { httpsUrlSchema } from './schemas';

/** A rendition name: lower-case letters and digits, e.g. `card2x`. It becomes part of every file name. */
export const presetNameSchema = z.string().regex(/^[a-z][a-z0-9]{0,15}$/, { message: 'a short lower-case name such as card2x' });

/** The sizes made from every original (A2.9.7): name and width; the height follows the ratio. */
export const imagePresetsSchema = z
  .array(z.object({ name: presetNameSchema, width: z.int().min(16).max(6000) }))
  .min(1)
  .max(12)
  .refine((a) => new Set(a.map((p) => p.name)).size === a.length, { message: 'every size needs its own name' });

export const imageFormatSchema = z.enum(['avif', 'webp', 'jpeg']);

/** Each size in these formats; JPEG is always kept because every browser can read it. */
export const imageFormatsSchema = z
  .array(imageFormatSchema)
  .min(1)
  .refine((a) => new Set(a).size === a.length, { message: 'a format is listed twice' })
  .refine((a) => a.includes('jpeg'), { message: 'JPEG must stay: it is the fallback for old browsers' });

/** Width : height, e.g. 4 : 5. */
export const aspectRatioSchema = z.object({ width: z.int().min(1).max(100), height: z.int().min(1).max(100) });

/** Which sizes a page slot may offer, on a phone and on a larger screen (PR 24). */
export const imageSlotsSchema = z.record(
  z.string().regex(/^[a-z][a-zA-Z0-9]{0,31}$/),
  z.object({ phone: z.array(presetNameSchema).min(1), wide: z.array(presetNameSchema).min(1) }),
);

export const productMediaRoleSchema = z.enum(['FRONT', 'BACK', 'DETAIL', 'ON_MODEL', 'FLAT_LAY', 'FABRIC', 'TRUE_COLOUR', 'SET', 'VIDEO', 'OTHER']);

export const watermarkPositionSchema = z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left', 'centre', 'tiled']);

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff'] as const;

export const mediaSettings = {
  // ---- PR 22 · standardisation ----
  'media.image.presets': setting({
    schema: imagePresetsSchema,
    default: [
      { name: 'thumb', width: 160 },
      { name: 'card', width: 400 },
      { name: 'card2x', width: 800 },
      { name: 'main', width: 1200 },
      { name: 'zoom', width: 2000 },
    ],
    scope: 'store',
    valueType: 'JSON',
    group: 'media',
    labelKey: 'media.image.presets.label',
    helpKey: 'media.image.presets.help',
    isOwnerData: false,
    sortOrder: 10,
    version: 6,
  }),
  'media.image.aspectRatio': setting({
    schema: aspectRatioSchema,
    default: { width: 4, height: 5 },
    scope: 'store',
    valueType: 'JSON',
    group: 'media',
    labelKey: 'media.image.aspectRatio.label',
    helpKey: 'media.image.aspectRatio.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 20,
    version: 6,
  }),
  'media.image.formats': setting({
    schema: imageFormatsSchema,
    default: ['avif', 'webp', 'jpeg'],
    scope: 'store',
    valueType: 'JSON',
    group: 'media',
    labelKey: 'media.image.formats.label',
    helpKey: 'media.image.formats.help',
    isOwnerData: false,
    sortOrder: 30,
    version: 6,
  }),
  'media.image.quality': setting({
    schema: z.int().min(75).max(80),
    default: 78,
    scope: 'store',
    valueType: 'INT',
    group: 'media',
    labelKey: 'media.image.quality.label',
    helpKey: 'media.image.quality.help',
    isOwnerData: false,
    sortOrder: 40,
    version: 6,
  }),
  'media.image.avifEffort': setting({
    schema: z.int().min(0).max(9),
    default: 4,
    scope: 'installation',
    valueType: 'INT',
    group: 'media',
    labelKey: 'media.image.avifEffort.label',
    helpKey: 'media.image.avifEffort.help',
    isOwnerData: false,
    sortOrder: 50,
    version: 6,
  }),
  'media.image.fit': setting({
    schema: z.enum(['contain', 'cover']),
    default: 'contain',
    scope: 'store',
    valueType: 'ENUM',
    group: 'media',
    labelKey: 'media.image.fit.label',
    helpKey: 'media.image.fit.help',
    isOwnerData: false,
    sortOrder: 60,
    version: 6,
  }),
  'media.image.background': setting({
    schema: z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: 'a colour such as #ffffff' }),
    default: '#ffffff',
    scope: 'store',
    valueType: 'COLOR',
    group: 'media',
    labelKey: 'media.image.background.label',
    helpKey: 'media.image.background.help',
    isOwnerData: false,
    sortOrder: 70,
    version: 6,
  }),
  'media.upload.maxBytes': setting({
    schema: z.int().min(1024 * 1024).max(200 * 1024 * 1024),
    default: 25 * 1024 * 1024,
    scope: 'installation',
    valueType: 'INT',
    group: 'media',
    labelKey: 'media.upload.maxBytes.label',
    helpKey: 'media.upload.maxBytes.help',
    isOwnerData: false,
    sortOrder: 80,
    version: 6,
  }),
  'media.upload.minWidth': setting({
    schema: z.int().min(160).max(6000),
    default: 1200,
    scope: 'store',
    valueType: 'INT',
    group: 'media',
    labelKey: 'media.upload.minWidth.label',
    helpKey: 'media.upload.minWidth.help',
    isOwnerData: false,
    sortOrder: 90,
    version: 6,
  }),
  'media.upload.acceptedTypes': setting({
    schema: z.array(z.enum(IMAGE_TYPES)).min(1),
    default: [...IMAGE_TYPES],
    scope: 'installation',
    valueType: 'JSON',
    group: 'media',
    labelKey: 'media.upload.acceptedTypes.label',
    helpKey: 'media.upload.acceptedTypes.help',
    isOwnerData: false,
    sortOrder: 100,
    version: 6,
  }),
  'media.processing.mode': setting({
    schema: z.enum(['inline', 'queue']),
    default: 'inline',
    scope: 'installation',
    valueType: 'ENUM',
    group: 'media',
    labelKey: 'media.processing.mode.label',
    helpKey: 'media.processing.mode.help',
    isOwnerData: false,
    sortOrder: 110,
    version: 6,
  }),

  // ---- PR 24 · delivery ----
  'media.image.slots': setting({
    schema: imageSlotsSchema,
    default: {
      thumb: { phone: ['thumb'], wide: ['thumb'] },
      card: { phone: ['card', 'card2x'], wide: ['card', 'card2x'] },
      main: { phone: ['card', 'card2x'], wide: ['card2x', 'main'] },
      zoom: { phone: ['main'], wide: ['zoom'] },
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'media',
    labelKey: 'media.image.slots.label',
    helpKey: 'media.image.slots.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 120,
    version: 6,
  }),
  'media.image.phoneMaxWidth': setting({
    schema: z.int().min(320).max(1200),
    default: 767,
    scope: 'store',
    valueType: 'INT',
    group: 'media',
    labelKey: 'media.image.phoneMaxWidth.label',
    helpKey: 'media.image.phoneMaxWidth.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 130,
    version: 6,
  }),
  // The CDN address in front of the media store holds the owner's domain: his own data, empty = this site's /media.
  'media.publicBaseUrl': setting({
    schema: httpsUrlSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'URL',
    group: 'media',
    labelKey: 'media.publicBaseUrl.label',
    helpKey: 'media.publicBaseUrl.help',
    isOwnerData: true,
    sortOrder: 140,
    version: 6,
  }),
  'media.serve.maxAgeSeconds': setting({
    schema: z.int().min(60).max(2 * 365 * 24 * 3600),
    default: 365 * 24 * 3600,
    scope: 'installation',
    valueType: 'DURATION_SECONDS',
    group: 'media',
    labelKey: 'media.serve.maxAgeSeconds.label',
    helpKey: 'media.serve.maxAgeSeconds.help',
    isOwnerData: false,
    sortOrder: 150,
    version: 6,
  }),

  // ---- PR 25 · the minimum photo set ----
  'media.photos.minimum': setting({
    schema: z.int().min(1).max(20),
    default: 4,
    scope: 'store',
    valueType: 'INT',
    group: 'media',
    labelKey: 'media.photos.minimum.label',
    helpKey: 'media.photos.minimum.help',
    isOwnerData: false,
    sortOrder: 160,
    version: 6,
  }),
  'media.photos.requiredRoles': setting({
    schema: z.array(productMediaRoleSchema).refine((a) => new Set(a).size === a.length, { message: 'a photo type is listed twice' }),
    default: ['FRONT', 'BACK', 'DETAIL', 'ON_MODEL'],
    scope: 'store',
    valueType: 'JSON',
    group: 'media',
    labelKey: 'media.photos.requiredRoles.label',
    helpKey: 'media.photos.requiredRoles.help',
    isOwnerData: false,
    sortOrder: 170,
    version: 6,
  }),
  'media.photos.frontPerColour': setting({
    schema: z.boolean(),
    default: false,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'media',
    labelKey: 'media.photos.frontPerColour.label',
    helpKey: 'media.photos.frontPerColour.help',
    isOwnerData: false,
    sortOrder: 180,
    version: 6,
  }),

  // ---- PR 23 · watermark on download only ----
  'media.watermark.enabled': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'media',
    labelKey: 'media.watermark.enabled.label',
    helpKey: 'media.watermark.enabled.help',
    isOwnerData: false,
    sortOrder: 190,
    version: 6,
  }),
  'media.watermark.text': setting({
    schema: z.string().trim().min(1).max(80).nullable(),
    default: null,
    scope: 'store',
    valueType: 'STRING',
    group: 'media',
    labelKey: 'media.watermark.text.label',
    helpKey: 'media.watermark.text.help',
    isOwnerData: true,
    sortOrder: 200,
    version: 6,
  }),
  'media.watermark.position': setting({
    schema: watermarkPositionSchema,
    default: 'bottom-right',
    scope: 'store',
    valueType: 'ENUM',
    group: 'media',
    labelKey: 'media.watermark.position.label',
    helpKey: 'media.watermark.position.help',
    isOwnerData: false,
    sortOrder: 210,
    version: 6,
  }),
  'media.watermark.opacity': setting({
    schema: z.number().min(0.05).max(1),
    default: 0.4,
    scope: 'store',
    valueType: 'DECIMAL',
    group: 'media',
    labelKey: 'media.watermark.opacity.label',
    helpKey: 'media.watermark.opacity.help',
    isOwnerData: false,
    sortOrder: 220,
    version: 6,
  }),
  'media.watermark.scale': setting({
    schema: z.int().min(2).max(20),
    default: 5,
    scope: 'store',
    valueType: 'INT',
    group: 'media',
    labelKey: 'media.watermark.scale.label',
    helpKey: 'media.watermark.scale.help',
    isOwnerData: false,
    sortOrder: 230,
    version: 6,
  }),
  'media.watermark.preset': setting({
    schema: presetNameSchema,
    default: 'main',
    scope: 'store',
    valueType: 'STRING',
    group: 'media',
    labelKey: 'media.watermark.preset.label',
    helpKey: 'media.watermark.preset.help',
    isOwnerData: false,
    sortOrder: 240,
    version: 6,
  }),

  // ---- PR 37 · the library ----
  'media.orphans.graceDays': setting({
    schema: z.int().min(1).max(3650),
    default: 30,
    scope: 'store',
    valueType: 'INT',
    group: 'media',
    labelKey: 'media.orphans.graceDays.label',
    helpKey: 'media.orphans.graceDays.help',
    isOwnerData: false,
    sortOrder: 250,
    version: 6,
  }),
  'media.library.pageSize': setting({
    schema: z.int().min(10).max(200),
    default: 50,
    scope: 'installation',
    valueType: 'INT',
    group: 'media',
    labelKey: 'media.library.pageSize.label',
    helpKey: 'media.library.pageSize.help',
    isOwnerData: false,
    sortOrder: 260,
    version: 6,
  }),
};
