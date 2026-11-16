// S28 · PR 1031 — what the add-product wizard's page hands the client: the lists, the draft (when there is one), the photo parts and the
// few settings it needs, all read as the signed-in person. Reading only; the steps write through their own routes.
import * as cat from '@extas/catalogue';
import { productPhotoQuality } from '@extas/media';
import type { PhotoProps } from '@/components/admin/products/wizard/ctx';
import type { ProductWizardProps } from '@/components/admin/products/wizard/ProductWizard';
import { PLACE_WORDS } from '@/components/admin/products/seo-score';
import type { CatalogueAccess } from './admin-products';
import { photosOf, PRODUCTS_HOME, storeMoney } from './admin-products';
import { loadErpStyles, loadWizard, loadWizardLists } from './admin-wizard';
import { productV5Cards } from './products-v5-settings-api';
import type { PageAccess } from './admin-page';
import { inventoryDeps } from './inventory-api';
import { mediaDeps } from './media';
import type { Dict } from './i18n';
import type { Lang } from '@/components/admin/products/model';

export interface WizardPageInput {
  c: CatalogueAccess;
  access: Extract<PageAccess, { kind: 'ok' }>;
  d: Dict;
  lang: Lang;
  locale: string;
  /** The draft to walk, or null on the start page. */
  id: string | null;
  step: number;
}

export async function wizardProps(i: WizardPageInput): Promise<ProductWizardProps> {
  const { c } = i;
  const [lists, money, requirePin] = await Promise.all([loadWizardLists(c), storeMoney(c, i.locale), c.deps.settings.value('catalogue.prices.requirePin', { storeId: c.storeId })]);
  const data = i.id ? await loadWizard(c, i.id) : null;
  const erp = !data && c.can('inventory.read') ? await loadErpStyles(await inventoryDeps(i.access.deps), c.who) : null;
  const media = mediaDeps();
  const photos: PhotoProps = { gallery: data?.gallery ?? [], images: {}, notes: { on: false, byLink: {} }, video: { on: false, allowUpload: false, maxUploadMb: 0, current: null } };
  let demoCount = 0;
  if (data) {
    photos.images = await photosOf(c, photos.gallery.map((g) => g.assetId));
    if (media && c.can('media.read')) {
      const q = await productPhotoQuality(media, c.who.actor, { storeId: c.storeId, productId: data.productId });
      photos.notes = { on: q.on, byLink: Object.fromEntries(q.photos.map((x) => [x.productMediaId, x.report ? { issues: x.report.issues, fixable: x.report.fixable, width: x.report.width, height: x.report.height } : null])) };
    }
    const v5 = await productV5Cards(i.access.deps, { actor: i.access.guard.actor, ctx: i.access.guard.ctx });
    const v = await cat.getProductVideo(c.deps, c.who, data.productId);
    photos.video = {
      on: v5['catalogue.video'].value.on === true,
      allowUpload: v5['catalogue.video'].value.allowUpload === true,
      maxUploadMb: Number(v5['catalogue.video'].value.maxUploadMb),
      current: v ? { source: v.source, provider: v.provider, url: v.url, durationSec: v.durationSec, titleEn: v.titleEn } : null,
    };
    if (data.categoryId) demoCount = await c.deps.db.product.count({ where: { storeId: c.storeId, categoryId: data.categoryId, isDemo: true, status: 'PUBLISHED', archivedAt: null } });
  }
  const drafts = data ? [] : await cat.wizardDrafts(c.deps, c.who, 5); // hardcode-ok: the last few drafts offered for "continue where I stopped"
  return {
    d: i.d,
    lang: i.lang,
    money,
    step: i.step,
    data,
    lists,
    erp,
    can: { write: c.can('catalogue.write'), prices: c.can('catalogue.prices'), publish: c.can('catalogue.publish'), upload: !!media && c.can('media.upload') },
    requirePin: requirePin === true,
    ownBrandId: lists.brands.find((b) => b.isOwnLabel)?.id ?? null,
    photos,
    place: PLACE_WORDS,
    demoCount,
    settingsHref: '/admin/products',
    listHref: PRODUCTS_HOME,
    resume: drafts.map((r) => ({ productId: r.productId, name: r.nameEn, step: r.step })),
  };
}
