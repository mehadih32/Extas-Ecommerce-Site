// PR 52 — which template a product page uses (Blueprint D3.7 / D4.2, demo 02-core.js pdpTemplateFor): the product's own
// choice at upload (Product.templateKey, while `pdp.templates.perProduct` is on), else its category's — the nearest one
// up the tree, the setting's `byCategory` before the category's own column — else the shop's default. A template the
// shop does not know (a later T4, a typo) falls through to the next rule, so a page is never blank. With
// `pdp.templates.preview` on, `?template=T2` shows that template for the admin's preview (the screen itself waits for
// the admin plan, CN-019). Pure.
import { PDP_TEMPLATES, type PdpTemplate, type PdpTemplatesSettings } from '@extas/settings';

/** The query that previews a template on a product address. */
export const TEMPLATE_QUERY = 'template';

/** One category of the product's chain, nearest first: its link name and the template stored on it. */
export interface TemplateCategory {
  slug: string;
  templateKey: string | null;
}

export const isTemplate = (v: unknown): v is PdpTemplate => typeof v === 'string' && (PDP_TEMPLATES as readonly string[]).includes(v);

export interface TemplateChoice {
  template: PdpTemplate;
  /** Where it came from: the preview, the product, a category (setting or column) or the shop's default. */
  from: 'preview' | 'product' | 'category' | 'default';
}

export function templateFor(
  set: Pick<PdpTemplatesSettings, 'default' | 'byCategory' | 'perProduct' | 'preview'>,
  product: { templateKey: string | null },
  chain: readonly TemplateCategory[],
  preview?: string | null,
): TemplateChoice {
  if (set.preview && isTemplate(preview)) return { template: preview, from: 'preview' };
  if (set.perProduct && isTemplate(product.templateKey)) return { template: product.templateKey, from: 'product' };
  for (const c of chain) {
    const own = set.byCategory[c.slug];
    if (isTemplate(own)) return { template: own, from: 'category' };
    if (isTemplate(c.templateKey)) return { template: c.templateKey, from: 'category' };
  }
  return { template: set.default, from: 'default' };
}
