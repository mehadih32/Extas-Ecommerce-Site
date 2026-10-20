// PR 21 — the suggested SKU of a new variant, the pure part (no database): the edit form in the browser imports it
// through `@extas/catalogue/sku`, the server through the package itself.
/**
 * The suggested SKU of a new variant from `catalogue.skuSuggestion` ({style}-{colour}-{size}): upper case, spaces as
 * hyphens. Empty when a token it needs has no value: the ERP's SKU is the real one, a suggestion never guesses.
 */
export function suggestSku(template: string, values: { style: string | null; colour: string | null; size: string | null }): string {
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = (values as Record<string, string | null>)[k];
    if (!v || !v.trim()) missing = true;
    return v ?? '';
  });
  if (missing || !out.trim()) return '';
  return out
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9._/-]/g, '');
}
