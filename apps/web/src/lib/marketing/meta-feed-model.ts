// S28 · PR 696 (CN-048; gap M12) — the Meta (Facebook and Instagram) catalogue feed, without the database. It is built from
// the same items as the Google feed (merchant-feed-model: products, photos, prices, sizes and colours) and writes them the
// way Meta reads them: RSS 2.0 with `g:` fields, availability as "in stock" / "out of stock", the price as `1500.00 BDT`.
// Beside it, an issue list per product: what keeps a product out of the feed (Google's reasons: no photo, no price, no
// description, sold out while sold-out ones stay out) and what Meta would flag (a title over Meta's 200 characters, a
// description over its 9,999, a description of one short word, no brand). Advice only: nothing is changed here.
import { reasonsOf, type FeedItem, type FeedProduct, type FeedReason } from './merchant-feed-model';

/** Meta's own limits (its catalogue specification), not business numbers. */
export const META_TITLE_MAX = 200; // hardcode-ok: Meta's limit for a title
export const META_TITLE_GOOD = 65; // hardcode-ok: Meta's advice for a title shown in full
export const META_DESCRIPTION_MAX = 9999; // hardcode-ok: Meta's limit for a description
export const META_DESCRIPTION_MIN = 20; // hardcode-ok: a one-word description gives Meta nothing to show

export const META_ISSUES = ['titleTooLong', 'titleLong', 'descriptionTooLong', 'descriptionShort', 'noBrand'] as const;
export type MetaIssue = (typeof META_ISSUES)[number];

export interface MetaProductIssues {
  id: string;
  title: string;
  /** Why it is not in the feed (the Google feed's reasons). */
  left: FeedReason[];
  /** What Meta would flag on it (the product still goes in unless it is left out). */
  issues: MetaIssue[];
}

/** The issue list: every product with at least one reason or issue, in the order given. */
export function metaIssues(products: readonly FeedProduct[], outOfStock: boolean): MetaProductIssues[] {
  const out: MetaProductIssues[] = [];
  for (const p of products) {
    const issues: MetaIssue[] = [];
    const title = p.title.trim();
    if (title.length > META_TITLE_MAX) issues.push('titleTooLong');
    else if (title.length > META_TITLE_GOOD) issues.push('titleLong');
    const d = (p.description ?? '').trim();
    if (d.length > META_DESCRIPTION_MAX) issues.push('descriptionTooLong');
    else if (d.length > 0 && d.length < META_DESCRIPTION_MIN) issues.push('descriptionShort');
    if (!p.brand.trim()) issues.push('noBrand');
    const left = reasonsOf(p, outOfStock);
    if (left.length || issues.length) out.push({ id: p.id, title: p.title, left, issues });
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Meta's words for availability. */
export const metaAvailability = (a: FeedItem['availability']): string => (a === 'in_stock' ? 'in stock' : 'out of stock');

/** The RSS 2.0 file Meta fetches. A title over Meta's limit is cut at the limit. */
export function metaFeedXml(head: { title: string; link: string }, items: readonly FeedItem[]): string {
  const tag = (name: string, value: string | null) => (value ? `<${name}>${esc(value)}</${name}>` : '');
  const lines = items.map(
    (i) =>
      `<item>${tag('g:id', i.id)}${tag('g:title', i.title.slice(0, META_TITLE_MAX))}${tag('g:description', i.description.slice(0, META_DESCRIPTION_MAX))}${tag('g:link', i.link)}${tag('g:image_link', i.image)}` +
      `${tag('g:availability', metaAvailability(i.availability))}${tag('g:condition', 'new')}${tag('g:price', i.price)}${tag('g:sale_price', i.salePrice)}${tag('g:brand', i.brand)}` +
      `${tag('g:product_type', i.productType)}${tag('g:item_group_id', i.groupId)}${tag('g:color', i.colour)}${tag('g:size', i.size)}${tag('g:gender', i.gender)}${tag('g:age_group', i.ageGroup)}</item>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>${tag('title', head.title)}${tag('link', head.link)}\n${lines.join('\n')}\n</channel></rss>\n`;
}
