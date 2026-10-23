// S02 · the product page templates — PR 52 (which template a page uses: the product's own choice at upload, else its
// category's, else the shop's default). Registry version 28. Labels: messages/pdp-templates.<lang>.json.
//
// The defaults reproduce the approved V12.2 demo (docs/demo/src/30-product.js, 02-core.js pdpTemplateFor; Blueprint
// D3.7 / D4.2: "T1 Classic / T2 Editorial / T3 Fit-first per category or product, default T1"). CN-018: every choice is
// a setting.
import { z } from 'zod';
import { setting } from './define';
import { categorySlugSchema } from './registry-storefront';

const V = 28;

/** The product page templates the shop knows (T4 video-first and T5 combo-push come later, D3.7). */
export const PDP_TEMPLATES = ['T1', 'T2', 'T3'] as const;
export type PdpTemplate = (typeof PDP_TEMPLATES)[number];

export const pdpTemplatesSchema = z
  .object({
    /** The shop's template: every product whose own choice and category say nothing. */
    default: z.enum(PDP_TEMPLATES),
    /** A category's template (by its link name); a product in a sub-category takes the nearest one up the tree. It
     * wins over the template stored on the category itself. */
    byCategory: z
      .record(categorySlugSchema, z.enum(PDP_TEMPLATES))
      .refine((r) => Object.keys(r).length <= 500, { message: 'at most 500 categories' }),
    /** The template chosen for a product at upload (D4.2) wins over its category's. */
    perProduct: z.boolean(),
    /** `?template=T2` on a product address shows that template (the admin's preview, PR 52); search engines are sent
     * to the plain address and never index it. */
    preview: z.boolean(),
  })
  .strict();

const json = { scope: 'store', valueType: 'JSON', group: 'productPage', isOwnerData: false, isPublic: true, version: V } as const;

export const pdpTemplateSettings = {
  'pdp.templates': setting({
    ...json,
    schema: pdpTemplatesSchema,
    default: { default: 'T1', byCategory: {}, perProduct: true, preview: true },
    labelKey: 'pdp.templates.label',
    helpKey: 'pdp.templates.help',
    sortOrder: 130,
  }),
};

export type PdpTemplatesSettings = z.output<typeof pdpTemplatesSchema>;
