// The product as plain facts in one language — what the product page's details block, the structured data and the AI
// assistant's grounded answers read (B6.8: the AI only says what the catalogue says). Nothing here is invented: an
// empty field stays empty (no guessed GSM, no guessed fibre).
import { allow, type CatalogueDeps, type Who } from './context';
import type { Lang } from './dictionaries';
import { fabricDictionaries, fabricFacts, type FabricFacts } from './fabrics';
import { msg } from './messages';
import { getProduct } from './products';

export interface ProductFacts {
  productId: string;
  lang: Lang;
  name: string;
  brand: string;
  path: string;
  category: string | null;
  garmentType: string | null;
  styleCode: string | null;
  colours: { key: string; name: string; hex: string; note: string | null }[];
  sizes: string[];
  fabric: FabricFacts | null;
  /** One line, e.g. "60% Cotton, 40% Polyester · Piqué · 220 GSM". */
  fabricLine: string;
  careNote: string | null;
  description: string | null;
  inStock: boolean;
  minPriceMinor: number | null;
}

export async function productFacts(deps: CatalogueDeps, who: Who, productId: string, lang: Lang): Promise<ProductFacts> {
  await allow(deps, who, 'catalogue.read');
  const p = await getProduct(deps, who, productId);
  let fabric: FabricFacts | null = null;
  if (p.fabric) {
    const dicts = await fabricDictionaries(deps, who);
    const care = await deps.db.fabric.findUniqueOrThrow({ where: { id: p.fabric.id }, select: { careEn: true, careBn: true, archivedAt: true } });
    fabric = fabricFacts({ ...p.fabric, careEn: care.careEn, careBn: care.careBn, archived: care.archivedAt != null, products: 0 }, dicts, lang);
  }
  const sep = msg(lang, 'naming.listSeparator');
  const fabricLine = fabric
    ? [fabric.fibres.map((f) => msg(lang, 'facts.fibreShare', { share: f.share, fibre: f.label })).join(sep), fabric.construction ?? '', fabric.gsm != null ? msg(lang, 'facts.gsm', { gsm: fabric.gsm }) : '']
        .filter(Boolean)
        .join(' · ')
    : '';
  const live = p.variants.filter((v) => !v.archived && v.active);
  const sizes: string[] = [];
  for (const v of [...live].sort((a, b) => (a.size?.sortOrder ?? 0) - (b.size?.sortOrder ?? 0))) {
    if (v.size && !sizes.includes(v.size.label)) sizes.push(v.size.label);
  }
  const pick = (en: string | null, bn: string | null) => (lang === 'bn' ? (bn ?? en) : en);
  return {
    productId: p.id,
    lang,
    name: pick(p.nameEn, p.nameBn) ?? p.nameEn,
    brand: p.brand.name,
    path: p.path,
    category: p.category ? pick(p.category.nameEn, p.category.nameBn) : null,
    garmentType: p.garmentType ? (lang === 'bn' ? p.garmentType.nameBn : p.garmentType.nameEn) : null,
    styleCode: p.erpStyleCode,
    colours: p.colours.filter((c) => !c.archived).map((c) => ({ key: c.key, name: pick(c.nameEn, c.nameBn) ?? c.nameEn, hex: c.hex, note: pick(c.noteEn, c.noteBn) })),
    sizes,
    fabric,
    fabricLine,
    careNote: pick(p.careEn, p.careBn) ?? fabric?.careNote ?? null,
    description: pick(p.descriptionEn, p.descriptionBn),
    inStock: p.inStock,
    minPriceMinor: p.minPriceMinor,
  };
}
