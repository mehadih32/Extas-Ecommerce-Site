import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import {
  CatalogueError,
  assertKeys,
  brandLine,
  compositionSchema,
  contrastRatio,
  fabricFacts,
  fillTemplate,
  formatMoney,
  hasWord,
  label,
  localeFor,
  msg,
  normalizeHex,
  normalizeName,
  normalizePath,
  namingViewOf,
  otherBrandHits,
  productPath,
  relativeLuminance,
  rgbDistance,
  singular,
  slugFromPath,
  slugify,
  stripBrand,
  summarise,
  tokenValues,
  type NameSource,
  type NamingSettings,
} from '../src';

const SLUG = { maxLength: 70, ampersand: 'and' };

describe('slugify (demo nm_slug)', () => {
  it('makes a link from any text', () => {
    expect(slugify('Piqué Polo & Co', SLUG)).toBe('pique-polo-and-co');
    expect(slugify("Levi's  Slim   Fit", SLUG)).toBe('levis-slim-fit');
    expect(slugify('  --Hello--World--  ', SLUG)).toBe('hello-world');
    expect(slugify('পাঞ্জাবি', SLUG)).toBe('');
  });
  it('keeps to the maximum length without a trailing hyphen', () => {
    expect(slugify('abc def ghi', { ...SLUG, maxLength: 8 })).toBe('abc-def');
  });
  it('uses the ampersand word from settings', () => {
    expect(slugify('A & B', { ...SLUG, ampersand: 'n' })).toBe('a-n-b');
  });
});

describe('fillTemplate (demo nm_tpl)', () => {
  const v = { brand: 'Lacoste', name: 'Lacoste Classic Polo', style: 'Classic Polo', colour: 'Navy', price: '', shop: 'Sample Shop' };
  it('fills tokens and says the brand once', () => {
    expect(fillTemplate('{brand} {name} {colour}', v)).toBe('Lacoste Classic Polo Navy');
  });
  it('collapses a repeated word or phrase', () => {
    expect(fillTemplate('{style} Polo', { style: 'Pique Polo' })).toBe('Pique Polo');
  });
  it('drops separators left by empty tokens', () => {
    expect(fillTemplate('{name} — {price} | {shop}', v)).toBe('Lacoste Classic Polo | Sample Shop');
    expect(fillTemplate('{name}. {fit}. {shop}.', { name: 'Polo', fit: '', shop: 'S' })).toBe('Polo. S.');
  });
  it('keeps unknown tokens as written', () => {
    expect(fillTemplate('{name} {nope}', { name: 'A' })).toBe('A {nope}');
  });
  it('makes a link with the brand once', () => {
    expect(fillTemplate('{brand}-{style}', { brand: 'Lacoste', style: 'Lacoste Polo' }, SLUG)).toBe('lacoste-polo');
    expect(fillTemplate('{brand}-{style}', { brand: 'Ralph Lauren', style: 'Polo Polo' }, SLUG)).toBe('ralph-lauren-polo');
  });
});

describe('brands in text', () => {
  it('strips the brand in front of a name', () => {
    expect(stripBrand('Lacoste Classic Polo', 'Lacoste')).toBe('Classic Polo');
    expect(stripBrand('Classic Polo', 'Lacoste')).toBe('Classic Polo');
  });
  it('finds whole words only', () => {
    expect(hasWord('The Boss shirt', 'boss')).toBe(true);
    expect(hasWord('Bossy shirt', 'boss')).toBe(false);
  });
  it("never counts the product's own brand or a listed brand inside it", () => {
    const brands = ['Ralph Lauren', 'Polo Ralph Lauren', 'Lacoste', 'Boss', 'Hugo Boss'];
    expect(otherBrandHits('Lacoste style polo', 'Sample Label', brands, false, SLUG)).toEqual(['Lacoste']);
    expect(otherBrandHits('Polo Ralph Lauren oxford', 'Ralph Lauren', brands, false, SLUG)).toEqual([]);
    expect(otherBrandHits('hugo-boss-tee', 'Sample', brands, true, SLUG)).toEqual(['Boss', 'Hugo Boss']);
    expect(otherBrandHits('', 'Sample', brands, false, SLUG)).toEqual([]);
  });
});

describe('paths', () => {
  it('normalises like the redirect table stores them', () => {
    expect(normalizePath('https://shop.example/Product/Old-Polo/?x=1#top')).toBe('/product/old-polo');
    expect(normalizePath('p/abc/')).toBe('/p/abc');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/%E0%A6%AA')).toBe('/প');
  });
  it('joins and splits the product path', () => {
    expect(productPath('/p', 'navy-polo')).toBe('/p/navy-polo');
    expect(productPath('/p/', 'navy-polo')).toBe('/p/navy-polo');
    expect(slugFromPath('/p', '/P/Navy-Polo/')).toBe('navy-polo');
    expect(slugFromPath('/p', '/polos')).toBeNull();
    expect(slugFromPath('/p', '/p/a/b')).toBeNull();
  });
  it('normalises names for the dictionary', () => {
    expect(normalizeName('  Bottle  GREEN ')).toBe('bottle green');
    expect(normalizeName('Off-White')).toBe('off white');
  });
});

describe('colour maths', () => {
  it('normalises hex to #RRGGBB', () => {
    expect(normalizeHex('#1b2a4a')).toBe('#1B2A4A');
    expect(normalizeHex('fff')).toBe('#FFFFFF');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('navy')).toBeNull();
  });
  it('measures luminance, contrast and distance', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1);
    expect(relativeLuminance('#000000')).toBeCloseTo(0);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21);
    expect(rgbDistance('#000000', '#000000')).toBe(0);
    expect(rgbDistance('#000000', '#030404')).toBeLessThan(10);
  });
});

describe('dictionaries', () => {
  const dict = [
    { key: 'cotton', en: 'Cotton', bn: 'সুতি' },
    { key: 'linen', en: 'Linen', bn: 'লিনেন' },
  ];
  it('reads a label, and keeps a removed key readable', () => {
    expect(label(dict, 'cotton', 'bn')).toBe('সুতি');
    expect(label(dict, 'gone', 'en')).toBe('gone');
  });
  it('names every unknown key', () => {
    expect(() => assertKeys(dict, ['cotton'], 'fibres')).not.toThrow();
    try {
      assertKeys(dict, ['cotton', 'silk', 'wool'], 'fibres');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CatalogueError);
      expect((e as CatalogueError).code).toBe('UNKNOWN_KEY');
      expect((e as CatalogueError).details).toEqual(['fibres: silk', 'fibres: wool']);
      expect((e as CatalogueError).status).toBe(400);
    }
  });
  it('ships default dictionaries in both languages', () => {
    for (const k of ['catalogue.colourFamilies', 'catalogue.fibres', 'catalogue.fabricConstructions', 'catalogue.careInstructions', 'catalogue.fabricFeatures'] as const) {
      const d = registry[k].default;
      expect(d.length).toBeGreaterThan(0);
      for (const e of d) expect(e.en && e.bn).toBeTruthy();
    }
  });
});

describe('fabric composition (PR 31)', () => {
  it('needs the shares to add up to the whole and each fibre once', () => {
    expect(compositionSchema.safeParse({ fibres: [{ fibre: 'cotton', share: 60 }, { fibre: 'polyester', share: 40 }] }).success).toBe(true);
    expect(compositionSchema.safeParse({ fibres: [{ fibre: 'cotton', share: 60 }] }).success).toBe(false);
    expect(compositionSchema.safeParse({ fibres: [{ fibre: 'cotton', share: 50 }, { fibre: 'cotton', share: 50 }] }).success).toBe(false);
    expect(compositionSchema.safeParse({ fibres: [] }).success).toBe(true);
  });
  it('turns into facts in either language, inventing nothing', () => {
    const dicts = {
      fibres: [{ key: 'cotton', en: 'Cotton', bn: 'সুতি' }],
      constructions: [{ key: 'pique', en: 'Piqué', bn: 'পিকে' }],
      care: [{ key: 'machine-wash-cold', en: 'Machine wash cold', bn: 'ঠান্ডা পানিতে মেশিনে ধোয়া' }],
      features: [],
    };
    const f = { id: 'f', nameEn: 'Cotton piqué', nameBn: null, composition: { fibres: [{ fibre: 'cotton', share: 100 }], construction: 'pique', care: ['machine-wash-cold'] }, gsm: null, careEn: null, careBn: null, archived: false, products: 0 };
    const bn = fabricFacts(f, dicts, 'bn');
    expect(bn.name).toBe('Cotton piqué');
    expect(bn.fibres).toEqual([{ fibre: 'cotton', label: 'সুতি', share: 100 }]);
    expect(bn.construction).toBe('পিকে');
    expect(bn.gsm).toBeNull();
    expect(bn.care).toEqual(['ঠান্ডা পানিতে মেশিনে ধোয়া']);
  });
});

describe('product summary', () => {
  it('prices from the in-stock variants, else from all', () => {
    expect(summarise([])).toEqual({ inStock: false, minPriceMinor: null });
    expect(summarise([{ inStock: false, priceMinor: 900 }, { inStock: true, priceMinor: 1200 }])).toEqual({ inStock: true, minPriceMinor: 1200 });
    expect(summarise([{ inStock: false, priceMinor: 900 }, { inStock: false, priceMinor: 1200 }])).toEqual({ inStock: false, minPriceMinor: 900 });
  });
});

describe('naming tokens and views (PR 590)', () => {
  const ns: NamingSettings = {
    slug: SLUG,
    slugFallback: 'product',
    prefix: '/p',
    statusCode: 301,
    templates: {
      slug: '{brand}-{style}',
      seoTitle: { en: '{name} — {price} | {shop}', bn: '{name} — {price} | {shop}' },
      metaDescription: { en: '{name} in {colours}. {fit}. {shop}.', bn: '{name}, রঙ: {colours}। {fit}। {shop}।' },
      feedTitle: '{brand} {name} {colour}',
    },
    coloursIn: 2,
    max: { seoTitle: 30, metaDescription: 155, feedTitle: 150 },
    storeName: 'Sample Shop',
    locale: 'bn-BD',
    currency: 'BDT',
    warn: true,
    brands: ['Lacoste', 'Ralph Lauren'],
    showBrandLine: true,
    showOwnLabel: false,
    ownLabel: { id: 'own', name: 'Sample Label' },
    bulkMax: 500,
  };
  const p: NameSource = {
    id: 'p1',
    status: 'DRAFT',
    nameEn: 'Classic Polos',
    nameBn: 'ক্লাসিক পোলো',
    slug: 'classic-polo',
    feedTitle: null,
    categoryId: 'c1',
    pdpBlocks: { fit: 'Regular fit' },
    minPriceMinor: 145000,
    brand: null,
    category: { id: 'c1', nameEn: 'Polos', nameBn: 'পোলো' },
    colours: [
      { nameEn: 'Navy', nameBn: 'নেভি' },
      { nameEn: 'White', nameBn: 'সাদা' },
      { nameEn: 'Red', nameBn: null },
    ],
  };
  it('reads the tokens', () => {
    const t = tokenValues(p, ns, null, 'en');
    expect(t.brand).toBe('Sample Label');
    expect(t.type).toBe('Polo');
    expect(t.colour).toBe('Navy');
    expect(t.colours).toBe('Navy, White +1');
    expect(t.fit).toBe('Regular fit');
    expect(t.price).toContain('1,450');
    const b = tokenValues(p, ns, { nameEn: 'Polo shirt', nameBn: 'পোলো শার্ট' }, 'bn');
    expect(b.name).toBe('ক্লাসিক পোলো');
    expect(b.type).toBe('পোলো শার্ট');
    expect(b.colours).toContain('নেভি, সাদা');
  });
  it('falls back to the template and notes overlong titles', () => {
    const v = namingViewOf(p, { title: {}, description: { en: 'Own words' } }, ns, null);
    expect(v.path).toBe('/p/classic-polo');
    expect(v.seoTitle.en.source).toBe('template');
    expect(v.seoTitle.en.over).toBe(true);
    expect(v.metaDescription.en).toMatchObject({ value: 'Own words', source: 'own' });
    expect(v.feedTitle.value).toBe('Sample Label Classic Polos Navy');
    expect(v.templateSlug).toBe('sample-label-classic-polos');
    expect(v.brand.source).toBe('ownLabel');
    expect(v.brandLine).toBe('');
  });
  it("shows the brand line for a real brand that the name does not say, and warns about other brands' names", () => {
    const lac: NameSource = { ...p, nameEn: 'Ralph Lauren style polo', brand: { id: 'b', name: 'Lacoste', isOwnLabel: false } };
    const v = namingViewOf(lac, { title: {}, description: {} }, ns, null);
    expect(brandLine(lac, ns)).toBe('Lacoste');
    expect(v.warnings.find((w) => w.field === 'name')?.brands).toEqual(['Ralph Lauren']);
    expect(namingViewOf(lac, { title: {}, description: {} }, { ...ns, warn: false }, null).warnings).toEqual([]);
  });
  it('helpers', () => {
    expect(singular('Accessories')).toBe('Accessory');
    expect(singular('Polos')).toBe('Polo');
    expect(singular('Dress')).toBe('Dress');
    expect(localeFor('bn-BD', 'en')).toBe('en-BD');
    expect(localeFor('bn', 'en')).toBe('en');
    expect(formatMoney(null, 'BDT', 'en-BD')).toBe('');
    expect(formatMoney(150, 'BDT', 'en-BD')).toContain('1.5');
    expect(msg('en', 'naming.coloursMore', { n: 3 })).toBe('+3');
  });
});
