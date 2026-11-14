// PR 726 — the owner's logo picture (Website › Brand & menus, `brand.logo` for a computer and the footer, `brand.logoPhone`
// for a phone) in the header and the footer, at the height he chose (`brand.logoSize`). Until a picture is uploaded, and
// while its sizes are still being made, the shop's name is drawn as before (the `fallback`), so the header never shows a
// hole. A server component: the picture's address is read once per request.
import { cache, type ReactNode } from 'react';
import { getPrisma } from '@extas/db/client';
import { imageSources } from '@extas/media';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '@/lib/settings';
import { readPageSettings, type ShopContext } from '@/lib/shop/context';

const KEYS = ['brand.logo', 'brand.logoPhone'] as const;

const logoUrls = cache(async (storeId: number): Promise<{ desk: string | null; phone: string | null }> => {
  const none = { desk: null, phone: null };
  const resolver = settingsResolver();
  if (!resolver || !process.env.DATABASE_URL) return none;
  try {
    const set = await readPageSettings(KEYS, storeId);
    const ids = [set['brand.logo'], set['brand.logoPhone']].filter((x): x is string => !!x);
    if (!ids.length) return none;
    const found = await withTimeout(imageSources({ db: getPrisma(), settings: resolver }, storeId, ids), settingsTimeoutMs());
    const widest = (id: string | null) => {
      const v = id ? [...(found.get(id)?.variants ?? [])].sort((a, b) => b.width - a.width || Number(b.format === 'jpeg') - Number(a.format === 'jpeg'))[0] : undefined;
      return v?.url ?? null;
    };
    const desk = widest(set['brand.logo']);
    const phone = widest(set['brand.logoPhone']);
    return { desk: desk ?? phone, phone: phone ?? desk };
  } catch {
    return none;
  }
});

export async function ShopLogo({ c, where, fallback }: { c: ShopContext; where: 'desk' | 'phone' | 'footer'; fallback: ReactNode }) {
  const urls = await logoUrls(c.storeId);
  const url = where === 'phone' ? urls.phone : urls.desk;
  if (!url) return <>{fallback}</>;
  const height = c.s['brand.logoSize'][where];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the owner's own picture, already sized by the media pipeline
    <img src={url} alt={c.storeName} className="logo-img" style={{ height, width: 'auto', maxWidth: '100%', display: 'block' }} data-testid={`logo-img-${where}`} />
  );
}
