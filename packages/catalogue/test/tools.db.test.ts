// PR 33, 36, 39 on a real PostgreSQL (throwaway database; skipped without TEST_DATABASE_ADMIN_URL): import a product
// from a link (read → preview → one draft, never a price, never published), the ghost archive and its back-in-stock
// list (public form, limits, contacts behind their own permission, nothing deleted), and the product audit report.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  backInStockRequests,
  backInStockSummary,
  createBrand,
  createCategory,
  createColour,
  createDraftFromImport,
  createFabric,
  createGarmentType,
  createProduct,
  createSize,
  createVariant,
  getProduct,
  linkImportView,
  previewLinkImport,
  productAudit,
  productPageState,
  publishProduct,
  registerInterest,
  unpublishProduct,
  updateInterest,
  updateProduct,
  type CatalogueDeps,
  type LinkImportDeps,
  type PageReaderConnection,
  type SettingsReader,
  type Who,
} from '../src';

type Perm = Parameters<typeof createRole>[2]['permissions'][number];

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}
async function details(p: Promise<unknown>): Promise<string[]> {
  try {
    await p;
    return [];
  } catch (e) {
    return (e as { details?: string[] }).details ?? [];
  }
}

const productHtml = (o: Record<string, unknown>) => `<html><head><title>${String(o.name ?? 'Page')}</title><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', ...o })}</script></head></html>`;

describe.skipIf(!HAS_TEST_DB)('catalogue tools on PostgreSQL (PR 33, 36, 39)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let clock = new Date('2026-10-20T08:00:00Z');
  const overrides = new Map<string, unknown>([['store.name', 'Sample Shop']]);
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const pages = new Map<string, string>();
  const reads: string[] = [];
  let readerFails: Error | null = null;
  const reader: PageReaderConnection = {
    mode: 'MOCK',
    provider: 'pageReader',
    api: {
      async read(url, limits) {
        reads.push(`${url} ${limits.maxBytes} ${limits.timeoutMs} ${limits.maxRedirects}`);
        if (readerFails) throw readerFails;
        const html = pages.get(url) ?? productHtml({ name: 'Unknown page' });
        return { url, finalUrl: url, status: 200, contentType: 'text/html', html, bytes: html.length };
      },
    },
  };
  const deps = (): LinkImportDeps => ({ db: t.prisma, settings, now: () => clock, pageReader: async () => reader });
  const plain = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const sys = (storeId = A): Who => ({ actor: SYSTEM, storeId });
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  let importer: Actor;
  let reader2: Actor;
  let editor: Actor;
  let listKeeper: Actor;
  let catPolo = '';
  let fabricId = '';
  let navy = '';
  let brandId = '';
  let sizeM = '';
  let sizeL = '';
  let n = 0;

  const staff = async (email: string, perms: Perm[]) => {
    const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!.replace(/[^a-z]/g, ''), nameEn: email, nameBn: email, permissions: perms });
    const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
    return { staffUserId: u.id };
  };
  const asset = async () =>
    (await t.prisma.mediaAsset.create({ data: { storeId: A, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `media/s${A}/o/tools-${++n}.jpg`, mimeType: 'image/jpeg', bytes: BigInt(1000), checksumSha256: `tools-${n}` } })).id;
  /** A complete, published product in the polo category, with one variant per size given. */
  const liveProduct = async (name: string, sizes: { sizeId: string; inStock: boolean }[]) => {
    const p = await createProduct(plain(), sys(), { nameEn: name, categoryId: catPolo, fabricId, erpStyleCode: `TL-${++n}`, descriptionEn: 'A plain sample garment.' });
    for (const [i, s] of sizes.entries()) {
      const v = await createVariant(plain(), sys(), { sku: `TL-${n}-${i}`, productId: p.id, colourId: navy, sizeId: s.sizeId, priceMinor: 120000, active: true });
      await t.prisma.productVariant.update({ where: { id: v.id }, data: { inStock: s.inStock } });
    }
    await t.prisma.product.update({ where: { id: p.id }, data: { inStock: sizes.some((s) => s.inStock) } });
    for (const role of ['FRONT', 'BACK', 'DETAIL', 'ON_MODEL'] as const) await t.prisma.productMedia.create({ data: { storeId: A, productId: p.id, assetId: await asset(), role } });
    await publishProduct(plain(), sys(), p.id);
    return (await getProduct(plain(), sys(), p.id));
  };

  beforeAll(async () => {
    t = await createTestDatabase('tools');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    importer = await staff('importer@example.com', ['catalogue.read', 'catalogue.write', 'catalogue.import']);
    reader2 = await staff('lookonly@example.com', ['catalogue.read', 'catalogue.import']);
    editor = await staff('editor@example.com', ['catalogue.read', 'catalogue.write']);
    listKeeper = await staff('lists@example.com', ['catalogue.read', 'catalogue.interest']);
    const gt = await createGarmentType(plain(), sys(), { nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [{ key: 'chest', labelEn: 'Chest', labelBn: 'বুক', unit: 'inch' }] });
    catPolo = (await createCategory(plain(), sys(), { nameEn: 'Polos', garmentTypeId: gt.id })).id;
    await createCategory(plain(), sys(), { nameEn: 'Shirts', garmentTypeId: gt.id });
    fabricId = (await createFabric(plain(), sys(), { nameEn: 'Cotton pique', composition: { fibres: [{ fibre: 'cotton', share: 100 }], construction: 'pique', care: [], features: [] } })).id;
    navy = (await createColour(plain(), sys(), { nameEn: 'Navy', hex: '#1B2A4A', synonyms: ['navy blue'] })).colour.id;
    await createColour(plain(), sys(), { nameEn: 'Black', hex: '#111111' });
    brandId = (await createBrand(plain(), sys(), { name: 'Sample Brand' })).id;
    sizeM = (await createSize(plain(), sys(), { label: 'M' })).id;
    sizeL = (await createSize(plain(), sys(), { label: 'L' })).id;
    const chart = await t.prisma.sizeChart.create({ data: { storeId: A, garmentTypeId: gt.id, name: 'Polo regular', columns: [], rows: [] } });
    await t.prisma.sizeChartAssignment.create({ data: { storeId: A, sizeChartId: chart.id, categoryId: catPolo } });
  });
  afterAll(async () => t?.drop());

  // ---------------------------------------------------------------------------------------------------------
  describe('import from a link (PR 33)', () => {
    const url = 'https://supplier.example.com/products/navy-pique-polo';
    beforeAll(() => {
      pages.set(
        url,
        productHtml({
          name: 'Navy Pique Polo',
          description: 'Soft pique polo with a ribbed collar.',
          brand: { name: 'sample brand' },
          color: 'Navy Blue',
          material: 'Cotton pique, 220 gsm',
          size: ['M', 'L', 'XXL'],
          sku: 'SUP-PQ-01',
          image: ['/i/1.jpg', '/i/2.jpg'],
          offers: { price: '990', priceCurrency: 'BDT' },
        }),
      );
    });

    it('reads the page within the settings, matches the shop dictionaries and shows price, SKU and sizes for information only', async () => {
      const p = await previewLinkImport(deps(), as(importer), { url });
      expect(reads.at(-1)).toBe(`${url} ${2000 * 1024} ${15 * 1000} 3`);
      expect(p.reader).toEqual({ mode: 'MOCK', provider: 'pageReader' });
      expect(p.draft).toMatchObject({ nameEn: 'Navy Pique Polo', descriptionEn: 'Soft pique polo with a ribbed collar.', brandId, categoryId: catPolo, fabricId, colourIds: [navy] });
      expect(p.draft.sizes).toEqual([
        { label: 'M', sizeId: sizeM },
        { label: 'L', sizeId: sizeL },
        { label: 'XXL', sizeId: null },
      ]);
      expect(p.facts.price).toEqual({ amount: '990', currency: 'BDT' });
      expect(p.facts.images).toEqual(['https://supplier.example.com/i/1.jpg', 'https://supplier.example.com/i/2.jpg']);
      expect(p.method).toBe('rules');
      expect(p.notes).toEqual(['ai-off']);
      expect(p.earlier).toEqual([]);
      const job = await t.prisma.catalogImportJob.findUniqueOrThrow({ where: { id: p.jobId } });
      expect(job).toMatchObject({ storeId: A, kind: 'IMPORT_FROM_LINK', sourceUrl: url, status: 'SUCCEEDED', createdById: importer.staffUserId });
      const log = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: p.jobId, action: 'catalogImport.linkRead' } });
      expect(JSON.stringify(log.after)).not.toContain('ribbed');
    });

    it('makes one draft from a read: no price, no supplier SKU, never published', async () => {
      const p = await previewLinkImport(deps(), as(importer), { url });
      expect(p.earlier).toHaveLength(1);
      const r = await createDraftFromImport(plain(), as(importer), p.jobId, { nameEn: 'Navy Pique Polo (sample)' });
      const prod = await getProduct(plain(), sys(), r.productId);
      expect(prod).toMatchObject({ nameEn: 'Navy Pique Polo (sample)', status: 'DRAFT', brandId, erpStyleCode: null, minPriceMinor: null, variants: [] });
      expect(prod.category?.id).toBe(catPolo);
      expect(prod.colours.map((c) => c.colourId)).toEqual([navy]);
      expect(await t.prisma.priceHistory.count({ where: { storeId: A } })).toBe(0);
      expect(await details(createDraftFromImport(plain(), as(importer), p.jobId))).toEqual([`productId:${r.productId}`]);
      const again = await previewLinkImport(deps(), as(importer), { url });
      expect(again.earlier.find((e) => e.jobId === p.jobId)?.productId).toBe(r.productId);
      const view = await linkImportView(deps(), as(importer));
      expect(view.jobs[0]).toMatchObject({ id: again.jobId, stage: 'preview', mode: 'MOCK' });
      expect(view.jobs.find((j) => j.id === p.jobId)).toMatchObject({ stage: 'drafted', productId: r.productId, name: 'Navy Pique Polo' });
    });

    it('a page that cannot be read is recorded and refused with the reader reason', async () => {
      readerFails = Object.assign(new Error('TIMEOUT: slow'), { name: 'PageReadError', code: 'TIMEOUT', detail: null });
      try {
        expect(await details(previewLinkImport(deps(), as(importer), { url: 'https://supplier.example.com/slow' }))).toEqual(['TIMEOUT']);
      } finally {
        readerFails = null;
      }
      const failed = await t.prisma.catalogImportJob.findFirstOrThrow({ where: { sourceUrl: 'https://supplier.example.com/slow' } });
      expect(failed.status).toBe('FAILED');
      expect(await code(createDraftFromImport(plain(), as(importer), failed.id))).toBe('CONFLICT');
      pages.set('https://supplier.example.com/empty', '<html><body>nothing</body></html>');
      expect(await details(previewLinkImport(deps(), as(importer), { url: 'https://supplier.example.com/empty' }))).toEqual(['NO_PRODUCT']);
    });

    it('follows the settings: switched off, allowed sites; and the permissions', async () => {
      overrides.set('catalogue.linkImport.allowedHosts', ['supplier.example.com']);
      try {
        expect(await code(previewLinkImport(deps(), as(importer), { url: 'https://other.example.org/p' }))).toBe('HOST_NOT_ALLOWED');
        expect(await code(previewLinkImport(deps(), as(importer), { url: 'https://www.supplier.example.com/p' }))).toBe('ok');
      } finally {
        overrides.delete('catalogue.linkImport.allowedHosts');
      }
      overrides.set('catalogue.linkImport.enabled', false);
      try {
        expect(await code(previewLinkImport(deps(), as(importer), { url }))).toBe('LINK_IMPORT_OFF');
      } finally {
        overrides.delete('catalogue.linkImport.enabled');
      }
      expect(await code(previewLinkImport(deps(), as(editor), { url }))).toBe('FORBIDDEN');
      const p = await previewLinkImport(deps(), as(reader2), { url });
      expect(await code(createDraftFromImport(plain(), as(reader2), p.jobId))).toBe('FORBIDDEN');
      expect(await code(createDraftFromImport(plain(), sys(B), p.jobId))).toBe('NOT_FOUND');
      expect(await code(previewLinkImport(deps(), as(importer), { url: 'file:///etc/passwd' }))).toBe('HOST_NOT_ALLOWED');
    });

    it('uses the AI tidy-up only when AI is on, wanted and connected', async () => {
      overrides.set('ai.enabled', true);
      try {
        expect((await previewLinkImport(deps(), as(importer), { url })).notes).toEqual(['ai-not-connected']);
        const ai = await previewLinkImport({ ...deps(), aiDraft: async () => ({ nameEn: 'Navy Pique Polo Shirt' }) }, as(importer), { url });
        expect(ai).toMatchObject({ method: 'ai', notes: [], draft: { nameEn: 'Navy Pique Polo Shirt' } });
        const broken = await previewLinkImport({ ...deps(), aiDraft: async () => Promise.reject(new Error('down')) }, as(importer), { url });
        expect(broken).toMatchObject({ method: 'rules', notes: ['ai-failed'], draft: { nameEn: 'Navy Pique Polo' } });
        overrides.set('catalogue.linkImport.useAi', false);
        expect((await previewLinkImport(deps(), as(importer), { url })).notes).toEqual(['ai-not-used']);
      } finally {
        overrides.delete('ai.enabled');
        overrides.delete('catalogue.linkImport.useAi');
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe('ghost archive and back-in-stock interest (PR 36)', () => {
    it('a sold-out product keeps its page as a ghost with buyable alternatives; a never-published one has none', async () => {
      const sold = await liveProduct('Sold Out Polo', [{ sizeId: sizeM, inStock: false }]);
      const other = await liveProduct('Other Polo', [{ sizeId: sizeM, inStock: true }]);
      const s = await productPageState(plain(), A, sold.slug);
      expect(s).toMatchObject({ state: 'ghost', reason: 'soldOut', interest: { open: true, channels: ['phone', 'email'] } });
      expect(s!.alternatives.map((a) => a.id)).toContain(other.id);
      expect(s!.alternatives.map((a) => a.id)).not.toContain(sold.id);
      expect(s!.path).toBe(`${registry['naming.productPathPrefix'].default.replace(/\/+$/, '')}/${sold.slug}`);
      const live = await productPageState(plain(), A, other.slug);
      expect(live).toMatchObject({ state: 'live', reason: null, alternatives: [], interest: { open: false } });
      const draft = await createProduct(plain(), sys(), { nameEn: 'Never Live' });
      expect(await productPageState(plain(), A, draft.slug)).toBeNull();
      expect(await productPageState(plain(), B, sold.slug)).toBeNull();
      await unpublishProduct(plain(), sys(), other.id);
      expect(await productPageState(plain(), A, other.slug)).toMatchObject({ state: 'ghost', reason: 'unpublished' });
      await updateProduct(plain(), sys(), other.id, { archived: true });
      expect(await productPageState(plain(), A, other.slug)).toMatchObject({ state: 'ghost', reason: 'archived' });
    });

    it('takes a phone or e-mail once per open request, within the daily limit; the log never holds the contact', async () => {
      const p = await liveProduct('Wanted Polo', [{ sizeId: sizeM, inStock: false }]);
      const first = await registerInterest(plain(), A, { productId: p.id, phone: '01711-000000' });
      expect(first.created).toBe(true);
      expect(await registerInterest(plain(), A, { productId: p.id, phone: '+8801711000000' })).toEqual({ id: first.id, created: false });
      const row = await t.prisma.backInStockRequest.findUniqueOrThrow({ where: { id: first.id } });
      expect(row).toMatchObject({ storeId: A, productId: p.id, phone: '+8801711000000', email: null, notifiedAt: null, archivedAt: null });
      const log = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: first.id } });
      expect(JSON.stringify(log)).not.toContain('1711000000');
      expect(await code(registerInterest(plain(), A, { productId: p.id, phone: 'nope' }))).toBe('INVALID_INPUT');
      expect(await code(registerInterest(plain(), A, { productId: p.id, email: 'not-an-email' }))).toBe('INVALID_INPUT');
      expect(await code(registerInterest(plain(), A, { productId: p.id, phone: '01711000000', email: 'a@example.com' }))).toBe('INVALID_INPUT');
      expect((await registerInterest(plain(), A, { productId: p.id, email: 'Buyer@Example.com' })).created).toBe(true);
      expect(await t.prisma.backInStockRequest.count({ where: { email: 'buyer@example.com' } })).toBe(1);

      overrides.set('catalogue.ghost.interest.maxPerContactPerDay', 2);
      try {
        const q = await liveProduct('Busy Polo', [{ sizeId: sizeM, inStock: false }]);
        const r = await liveProduct('Busy Polo Two', [{ sizeId: sizeM, inStock: false }]);
        await registerInterest(plain(), A, { productId: q.id, email: 'busy@example.com' });
        await registerInterest(plain(), A, { productId: r.id, email: 'busy@example.com' });
        expect(await code(registerInterest(plain(), A, { productId: p.id, email: 'busy@example.com' }))).toBe('TOO_MANY_REQUESTS');
      } finally {
        overrides.delete('catalogue.ghost.interest.maxPerContactPerDay');
      }
      overrides.set('catalogue.ghost.interest.channels', ['email']);
      try {
        expect(await code(registerInterest(plain(), A, { productId: p.id, phone: '01811000000' }))).toBe('INTEREST_OFF');
      } finally {
        overrides.delete('catalogue.ghost.interest.channels');
      }
      overrides.set('catalogue.ghost.interest.enabled', false);
      try {
        expect(await code(registerInterest(plain(), A, { productId: p.id, phone: '01811000000' }))).toBe('INTEREST_OFF');
      } finally {
        overrides.delete('catalogue.ghost.interest.enabled');
      }
      expect(await code(registerInterest(plain(), B, { productId: p.id, phone: '01811000000' }))).toBe('NOT_FOUND');
    });

    it('a live product takes requests only for a size that is sold out', async () => {
      const p = await liveProduct('Half Polo', [
        { sizeId: sizeM, inStock: true },
        { sizeId: sizeL, inStock: false },
      ]);
      const [m, l] = p.variants;
      const page = await productPageState(plain(), A, p.slug);
      expect(page).toMatchObject({ state: 'live', interest: { open: true } });
      expect(await code(registerInterest(plain(), A, { productId: p.id, phone: '01911000000' }))).toBe('NOT_OUT_OF_STOCK');
      expect(await code(registerInterest(plain(), A, { productId: p.id, variantId: m!.id, phone: '01911000000' }))).toBe('NOT_OUT_OF_STOCK');
      expect((await registerInterest(plain(), A, { productId: p.id, variantId: l!.id, phone: '01911000000' })).created).toBe(true);
      const draft = await createProduct(plain(), sys(), { nameEn: 'Not yet' });
      expect(await code(registerInterest(plain(), A, { productId: draft.id, phone: '01911000000' }))).toBe('NOT_FOUND');
    });

    it('the admin sees counts with catalogue.read and contacts only with catalogue.interest; marks are never deletions', async () => {
      const sum = await backInStockSummary(plain(), as(editor));
      expect(sum.counts.waiting).toBeGreaterThanOrEqual(3);
      const wanted = sum.items.find((i) => i.nameEn === 'Wanted Polo')!;
      expect(wanted).toMatchObject({ waiting: 2, state: 'ghost', reason: 'soldOut', backInStock: false });
      expect(JSON.stringify(sum)).not.toContain('@example.com');
      expect(await code(backInStockRequests(plain(), as(editor)))).toBe('FORBIDDEN');
      const list = await backInStockRequests(plain(), as(listKeeper), { productId: wanted.productId });
      expect(list.items.map((i) => i.phone ?? i.email)).toEqual(['+8801711000000', 'buyer@example.com']);
      const ids = list.items.map((i) => i.id);
      expect(await updateInterest(plain(), as(listKeeper), { action: 'told', ids: [ids[0]!] })).toEqual({ action: 'told', changed: 1 });
      expect(await updateInterest(plain(), as(listKeeper), { action: 'archive', ids })).toEqual({ action: 'archive', changed: 2 });
      expect((await backInStockRequests(plain(), as(listKeeper), { productId: wanted.productId })).total).toBe(0);
      expect((await backInStockRequests(plain(), as(listKeeper), { productId: wanted.productId, state: 'archived' })).total).toBe(2);
      expect(await updateInterest(plain(), as(listKeeper), { action: 'restore', ids })).toEqual({ action: 'restore', changed: 2 });
      expect((await backInStockRequests(plain(), as(listKeeper), { productId: wanted.productId, state: 'told' })).total).toBe(1);
      expect(await t.prisma.backInStockRequest.count({ where: { productId: wanted.productId } })).toBe(2);
      expect(await code(updateInterest(plain(), as(editor), { action: 'told', ids }))).toBe('FORBIDDEN');
      expect(await code(updateInterest(plain(), sys(B), { action: 'told', ids }))).toBe('NOT_FOUND');
      const log = await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'backInStock.' } } });
      expect(JSON.stringify(log)).not.toMatch(/@example\.com|1711000000/);

      // Back in stock: the product moves to the top, "ready to tell".
      await t.prisma.product.update({ where: { id: wanted.productId }, data: { inStock: true } });
      const after = await backInStockSummary(plain(), as(editor));
      expect(after.items[0]).toMatchObject({ productId: wanted.productId, backInStock: true, state: 'live' });
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe('product audit report (PR 39)', () => {
    it('lists every incomplete product with what it misses, live half-done ones first, filterable by check and status', async () => {
      const bare = await createProduct(plain(), sys(), { nameEn: 'Audit Bare' });
      const live = await liveProduct('Audit Live', [{ sizeId: sizeM, inStock: true }]);
      // The live product loses its fabric: it is on the shop half-done.
      await t.prisma.product.update({ where: { id: live.id }, data: { fabricId: null } });
      clock = new Date(clock.getTime() + 8 * 86_400_000);
      const r = await productAudit(plain(), as(editor));
      expect(r.rechecked).toBeGreaterThan(0);
      expect(r.items[0]).toMatchObject({ productId: live.id, liveBlocked: true, status: 'PUBLISHED' });
      expect(r.items[0]!.failing.map((c) => c.key)).toEqual(['fabric']);
      const b = r.items.find((i) => i.productId === bare.id)!;
      expect(b.failing.map((c) => c.key)).toEqual(['category', 'variants', 'price', 'photos', 'sizeChart', 'fabric', 'description', 'stock']);
      expect(r.byCheck.find((c) => c.key === 'fabric')!.failing).toBeGreaterThanOrEqual(2);
      expect(r.liveBlocked).toBeGreaterThanOrEqual(1);
      expect(r.byStatus.all).toBe(r.incomplete);
      const photos = await productAudit(plain(), as(editor), { check: 'photos' });
      expect(photos.items.every((i) => i.failing.some((c) => c.key === 'photos'))).toBe(true);
      expect(photos.items.some((i) => i.productId === live.id)).toBe(false);
      const liveOnly = await productAudit(plain(), as(editor), { status: 'live' });
      expect(liveOnly.items.every((i) => i.status === 'PUBLISHED')).toBe(true);
      expect(await code(productAudit(plain(), as(editor), { check: 'nope' as never }))).toBe('INVALID_INPUT');
    });

    it('checks stale products again within the limit; "check all again" carries on where it stopped', async () => {
      overrides.set('catalogue.audit.recheckMax', 2);
      try {
        clock = new Date(clock.getTime() + 60_000);
        const products = await t.prisma.product.count({ where: { storeId: A, archivedAt: null } });
        const since = clock.toISOString();
        clock = new Date(clock.getTime() + 1000);
        const first = await productAudit(plain(), as(editor), { recheckSince: since });
        expect(first.rechecked).toBe(2);
        expect(first.waiting).toBe(products - 2);
        const second = await productAudit(plain(), as(editor), { recheckSince: since });
        expect(second.rechecked).toBe(2);
        expect(second.waiting).toBe(products - 4);
        // Without "check all again" nothing is stale yet (checked within catalogue.audit.staleDays).
        const plainOpen = await productAudit(plain(), as(editor));
        expect(plainOpen.waiting).toBe(0);
      } finally {
        overrides.delete('catalogue.audit.recheckMax');
      }
      expect(await code(productAudit(plain(), sys(B)))).toBe('ok');
      expect((await productAudit(plain(), sys(B))).products).toBe(0);
    });
  });
});
