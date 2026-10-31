// S10 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// rules as drafts and versions (PR 208, 209, 218), the owner's OK for money (CLAUDE.md rule 6), archive instead of
// delete, conflicts and "Fix everywhere" (PR 217), the preview, the simulation over real orders (PR 219), notices and
// the pop-up rules (PR 216), coupons with their limits (PR 213), what the storefront reads (PR 210–215), the end-date
// job and the sample rules. Every value is a made-up test value.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { SAMPLE_PACK_KEY } from '@extas/seed';
import {
  addStarterRules,
  archiveCoupon,
  archiveNotice,
  archiveRule,
  bustAll,
  checkCoupon,
  createCoupon,
  createNotice,
  createRule,
  discardDraft,
  discountWasFor,
  endExpiredRules,
  exchangeTermsFor,
  fixAllConflicts,
  fixConflict,
  getRule,
  liveNotices,
  liveRuleValue,
  listConflicts,
  listRules,
  listSimulations,
  previewRule,
  publishRule,
  quoteCart,
  redeemCoupon,
  refreshConflicts,
  resolveConflict,
  restoreVersion,
  ruleHistory,
  ruleTextFor,
  ruleTextsFor,
  saveDraft,
  setCouponEnabled,
  setNoticeEnabled,
  setRuleStatus,
  simulateRule,
  updateNotice,
  type RuleContent,
  type RulesDeps,
  type SettingsReader,
  type Who,
} from '../src';
import { seedSampleRules } from '../src/sample';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const T0 = new Date('2026-10-20T06:00:00Z');

describe.skipIf(!HAS_TEST_DB)('Smart Rules on PostgreSQL (S10)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let clock = T0;
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      if (overrides.has(sk)) return overrides.get(sk) as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): RulesDeps => ({ db: t.prisma, settings, now: () => clock });
  let reader: Actor;
  let writer: Actor;
  let publisher: Actor;
  let owner: Actor;
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase('rules');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: ('rules.read' | 'rules.write' | 'rules.publish' | 'rules.approve')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    reader = await staff('reader@example.com', ['rules.read']);
    writer = await staff('writer@example.com', ['rules.read', 'rules.write']);
    publisher = await staff('publisher@example.com', ['rules.read', 'rules.write', 'rules.publish']);
    owner = await staff('approver@example.com', ['rules.read', 'rules.write', 'rules.publish', 'rules.approve']);

    // A small sample catalogue: tops › polos, tops › tees; a polo and a tee with one variant each; three bands.
    const tops = await t.prisma.category.create({ data: { storeId: A, slug: 'tops', nameEn: 'Sample tops' } });
    const polos = await t.prisma.category.create({ data: { storeId: A, slug: 'polos', nameEn: 'Sample polos', parentId: tops.id } });
    const tees = await t.prisma.category.create({ data: { storeId: A, slug: 'tees', nameEn: 'Sample tees', parentId: tops.id } });
    ids.polos = polos.id;
    ids.tees = tees.id;
    const polo = await t.prisma.product.create({ data: { storeId: A, slug: 'sample-polo', nameEn: 'Sample polo', categoryId: polos.id } });
    const tee = await t.prisma.product.create({ data: { storeId: A, slug: 'sample-tee', nameEn: 'Sample tee', categoryId: tees.id } });
    ids.polo = polo.id;
    ids.tee = tee.id;
    ids.poloV = (await t.prisma.productVariant.create({ data: { storeId: A, productId: polo.id, sku: 'S-POLO-M', priceMinor: 100000, active: true } })).id;
    ids.teeV = (await t.prisma.productVariant.create({ data: { storeId: A, productId: tee.id, sku: 'S-TEE-M', priceMinor: 60000, active: true } })).id;
    // The bands' own charges (sample values): the checkout charges these, and so does the engine (follow-up 54).
    const charges: Record<string, number> = { 'dhaka-city': 8000, 'dhaka-sub-area': 10000, 'outside-dhaka': 12000 };
    for (const [i, key] of ['dhaka-city', 'dhaka-sub-area', 'outside-dhaka'].entries()) {
      ids[key] = (await t.prisma.deliveryBand.create({ data: { storeId: A, key, nameEn: key, chargeMinor: charges[key]!, enabled: true, sortOrder: i } })).id;
    }
    // Orders of the last days: two inside Dhaka, one outside.
    const order = async (num: string, band: string, items: [string, string, number, number][], daysAgo: number) =>
      t.prisma.order.create({
        data: {
          storeId: A,
          number: num,
          source: 'WEBSITE',
          currency: 'BDT',
          placedAt: new Date(T0.getTime() - daysAgo * 86_400_000),
          deliveryBandId: ids[band],
          paymentMethod: 'COD',
          subtotalMinor: items.reduce((s, x) => s + x[2] * x[3], 0),
          totalMinor: items.reduce((s, x) => s + x[2] * x[3], 0),
          idempotencyKey: `idem-${num}`,
          items: { create: items.map(([variantId, productId, price, qty]) => ({ storeId: A, variantId, productId, sku: 'S', productName: 'Sample', quantity: qty, unitPriceMinor: price, lineTotalMinor: price * qty })) },
        },
      });
    await order('S-1001', 'dhaka-city', [[ids.poloV, ids.polo, 100000, 1]], 1);
    await order('S-1002', 'dhaka-city', [[ids.poloV, ids.polo, 100000, 2]], 2);
    await order('S-1003', 'outside-dhaka', [[ids.teeV, ids.tee, 60000, 1]], 3);
    await order('S-0999', 'dhaka-city', [[ids.teeV, ids.tee, 60000, 1]], 90);
  });
  afterAll(async () => {
    await t?.drop();
  });
  beforeEach(() => {
    bustAll();
    clock = T0;
  });

  // ---- PR 208, 209 · drafts, the owner's OK, versions ------------------------------------------------------------------

  it('PR 209: a new rule is a draft, with its values from the settings or empty; only writers may make one', async () => {
    expect(await code(createRule(deps(), as(reader), { templateId: 'exchange' }))).toBe('FORBIDDEN');
    const r = await createRule(deps(), as(writer), { templateId: 'exchange' });
    ids.exchange = r.id;
    expect(r.live!.status).toBe('DRAFT');
    expect(r.version).toBe(1);
    expect(r.live!.params.find((p) => p.key === 'windowHours')!.value).toBe(72);
    expect(r.live!.params.find((p) => p.key === 'chargeDhakaCity')!.value).toBeNull();
    expect(r.issues.some((i) => i.code === 'MISSING_VALUE')).toBe(true);
    expect(r.needsOwnerOk).toBe(true);
    expect(await code(createRule(deps(), as(writer), { templateId: 'exchange' }))).toBe('KEY_TAKEN');
    expect(await code(createRule(deps(), as(writer), { templateId: 'nope' }))).toBe('NOT_FOUND');
    expect((await ruleHistory(deps(), as(reader), r.id)).versions).toHaveLength(1);
    // Another store cannot see it.
    expect(await code(getRule(deps(), { actor: SYSTEM, storeId: B }, r.id))).toBe('NOT_FOUND');
  });

  const withValues = (c: RuleContent, values: Record<string, unknown>, over: Partial<RuleContent> = {}): RuleContent => ({ ...c, params: c.params.map((p) => (p.key in values ? { ...p, value: values[p.key] } : p)), ...over });

  it("PR 208: an incomplete rule cannot go live; a money rule needs the owner's OK to switch on", async () => {
    const r = await getRule(deps(), as(reader), ids.exchange!);
    // Switching on with empty charges: refused with every reason.
    await saveDraft(deps(), as(writer), r.id, { content: { ...r.live!, status: 'ACTIVE' } });
    const incomplete = await code(publishRule(deps(), as(owner), r.id));
    expect(incomplete).toBe('RULE_INCOMPLETE');
    // Key and kind stay.
    expect(await code(saveDraft(deps(), as(writer), r.id, { content: { ...r.live!, key: 'other' } }))).toBe('KEY_FIXED');
    const full = withValues(r.live!, { perItem: 1, chargeDhakaCity: 8000, chargeDhakaSubArea: 10000, chargeOutsideDhaka: 12000 }, { status: 'ACTIVE' });
    const saved = await saveDraft(deps(), as(writer), r.id, { content: full, version: r.version });
    expect(saved.draft!.status).toBe('ACTIVE');
    expect(saved.live!.status).toBe('DRAFT');
    expect(await code(publishRule(deps(), as(writer), r.id))).toBe('FORBIDDEN');
    expect(await code(publishRule(deps(), as(publisher), r.id))).toBe('OWNER_OK_REQUIRED');
    const p = await publishRule(deps(), as(owner), r.id, { changeNote: 'Sample exchange on' });
    expect(p.ownerOk).toBe(true);
    expect(p.rule.version).toBe(2);
    expect(p.rule.live!.status).toBe('ACTIVE');
    expect(p.rule.draft).toBeNull();
    expect(p.rule.approvedAt).not.toBeNull();
    expect(p.rule.liveNow).toBe(true);
    const audit = await t.prisma.auditLog.findMany({ where: { entityId: r.id, action: 'rule.publish' } });
    expect(audit).toHaveLength(1);
  });

  it('PR 218: words-only changes need no OK; a value, a pause or a stale version does', async () => {
    const r = await getRule(deps(), as(reader), ids.exchange!);
    const words = { ...r.live!, text: { ...r.live!.text, short: { en: 'Exchange within {windowHours} hours of delivery for size or fault', bn: r.live!.text.short!.bn } } };
    await saveDraft(deps(), as(publisher), r.id, { content: words });
    const p = await publishRule(deps(), as(publisher), r.id);
    expect(p.ownerOk).toBe(false);
    expect(p.rule.approvedAt).not.toBeNull();
    await saveDraft(deps(), as(publisher), r.id, { content: withValues(words, { chargeDhakaCity: 9000 }) });
    expect(await code(publishRule(deps(), as(publisher), r.id))).toBe('OWNER_OK_REQUIRED');
    expect(await code(setRuleStatus(deps(), as(publisher), r.id, { status: 'PAUSED' }))).toBe('OWNER_OK_REQUIRED');
    expect(await code(publishRule(deps(), as(owner), r.id, { version: 1 }))).toBe('STALE_DRAFT');
    await discardDraft(deps(), as(publisher), r.id);
    expect(await code(publishRule(deps(), as(owner), r.id))).toBe('NOTHING_TO_PUBLISH');
    const h = await ruleHistory(deps(), as(reader), r.id);
    expect(h.versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(h.versions[0]!.changes.map((c) => c.path)).toEqual(['text.short.en']);
    expect(h.versions[0]!.money).toEqual([]);
    expect(h.versions[0]!.actorName).toBe('publisher@example.com');
    expect(h.versions[1]!.money.length).toBeGreaterThan(0);
  });

  it('PR 218: an old version comes back as the draft; publishing it is a new version; nothing is deleted', async () => {
    const id = ids.exchange!;
    const restored = await restoreVersion(deps(), as(writer), id, { version: 2 });
    expect(restored.draft!.text.short!.en).toBe('Exchange within {windowHours} hours for size or fault');
    await publishRule(deps(), as(publisher), id, { changeNote: 'Back to version 2 words' });
    const h = await ruleHistory(deps(), as(reader), id);
    expect(h.versions.map((v) => v.version)).toEqual([4, 3, 2, 1]);
    expect(await t.prisma.smartRuleVersion.count({ where: { ruleId: id } })).toBe(4);
  });

  it('archive: a live rule is paused first; archived rules leave the list and come back', async () => {
    const pol = await createRule(deps(), as(writer), { templateId: 'no-return' });
    ids.noReturn = pol.id;
    // A rule that moves no money goes live with the publisher alone.
    await saveDraft(deps(), as(writer), pol.id, { content: { ...pol.live!, status: 'ACTIVE' } });
    expect((await publishRule(deps(), as(publisher), pol.id)).ownerOk).toBe(false);
    expect(await code(archiveRule(deps(), as(publisher), pol.id, { archived: true }))).toBe('RULE_ACTIVE');
    await setRuleStatus(deps(), as(publisher), pol.id, { status: 'PAUSED' });
    await archiveRule(deps(), as(publisher), pol.id, { archived: true });
    expect((await listRules(deps(), as(reader))).rules.map((r) => r.key)).not.toContain('no-return');
    expect((await listRules(deps(), as(reader), { includeArchived: true })).rules.find((r) => r.key === 'no-return')!.archived).toBe(true);
    expect(await code(saveDraft(deps(), as(writer), pol.id, { content: pol.live! }))).toBe('RULE_ARCHIVED');
    await archiveRule(deps(), as(publisher), pol.id, { archived: false });
    expect((await listRules(deps(), as(reader))).rules.find((r) => r.key === 'no-return')!.status).toBe('PAUSED');
    expect(await t.prisma.smartRule.count({ where: { id: pol.id } })).toBe(1);
  });

  it('PR 209: the starter rules come as drafts, once', async () => {
    const first = await addStarterRules(deps(), as(writer));
    expect(first.created.sort()).toEqual(['delivery', 'exchange-order', 'order-edit']);
    expect((await addStarterRules(deps(), as(writer))).created).toEqual([]);
    const list = await listRules(deps(), as(reader));
    expect(list.rules.filter((r) => first.created.includes(r.key)).every((r) => r.status === 'DRAFT' && r.hasDraft === false)).toBe(true);
    expect(list.counts.delivery).toBe(1);
  });

  // ---- PR 210, 215 · what the storefront reads ---------------------------------------------------------------------

  it('PR 210: the delivery rule prices a cart from the database, with the free-delivery line', async () => {
    const d = (await listRules(deps(), as(reader), { kind: 'delivery' })).rules[0]!;
    ids.delivery = d.id;
    const r = await getRule(deps(), as(reader), d.id);
    await saveDraft(deps(), as(writer), d.id, { content: withValues(r.live!, { chargeDhakaCity: 8000, chargeDhakaSubArea: 10000, chargeOutsideDhaka: 12000, freeOver: 150000 }, { status: 'ACTIVE' }) });
    // Before it is live: the band's own charge (as at the checkout, follow-up 54), and no free-delivery line.
    const before = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.poloV!, quantity: 1 }], bandKey: 'dhaka-city', locale: 'en-BD' });
    expect(before.delivery).toMatchObject({ chargeMinor: 8000, reason: 'CHARGED', chargeRule: null, freeOverMinor: null });
    expect(before.deliveryLine).toBeNull();
    // A band switched off has no charge: "+ delivery", never the rule's figure in its place.
    await t.prisma.deliveryBand.update({ where: { id: ids['dhaka-city']! }, data: { enabled: false } });
    const off = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.poloV!, quantity: 1 }], bandKey: 'dhaka-city', locale: 'en-BD' });
    expect(off.delivery).toMatchObject({ chargeMinor: null, reason: 'NOT_SET' });
    expect(off.totalKnown).toBe(false);
    await t.prisma.deliveryBand.update({ where: { id: ids['dhaka-city']! }, data: { enabled: true } });
    await publishRule(deps(), as(owner), d.id);
    const q = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.poloV!, quantity: 1 }, { variantId: 'not-a-variant', quantity: 1 }], bandKey: 'dhaka-city', locale: 'en-BD' });
    expect(q.subtotalMinor).toBe(100000);
    expect(q.delivery.chargeMinor).toBe(8000);
    expect(q.deliveryLine).toBe('Add ৳500 more for free delivery');
    expect(q.skipped).toEqual(['not-a-variant']);
    const free = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.poloV!, quantity: 2 }], bandKey: 'dhaka-city', locale: 'bn-BD' });
    expect(free.delivery.free).toBe(true);
    expect(free.deliveryLine).toBe('আপনার ডেলিভারি ফ্রি');
  });

  it('PR 215: texts for a place come from the live rules, filled in, never with a token left', async () => {
    const product = await ruleTextsFor(deps(), { storeId: A, placement: 'product', locale: 'en-BD', productId: ids.polo });
    expect(product.map((x) => x.key).sort()).toEqual(['delivery', 'exchange']);
    expect(product.find((x) => x.key === 'exchange')!.texts.short).toBe('Exchange within 72 hours for size or fault');
    expect(product.find((x) => x.key === 'delivery')!.texts.short).toBe('Inside Dhaka ৳80 · Outside Dhaka ৳120 · Free over ৳1,500');
    const bn = await ruleTextFor(deps(), { storeId: A, key: 'exchange', slot: 'short', locale: 'bn-BD' });
    expect(bn).toContain('৭২ ঘণ্টা');
    expect(await ruleTextFor(deps(), { storeId: A, key: 'order-edit', slot: 'short' })).toBeNull();
    expect(await liveRuleValue(deps(), { storeId: A, ruleKey: 'exchange', param: 'windowHours' })).toBe(72);
    const terms = await exchangeTermsFor(deps(), { storeId: A, productId: ids.polo!, bandKey: 'outside-dhaka' });
    expect(terms).toMatchObject({ covered: true, windowHours: 72, chargeMinor: 12000 });
  });

  // ---- PR 217 · conflicts ---------------------------------------------------------------------------------------------

  it('PR 217: a notice that writes "7 days" by hand drifts; "Fix everywhere" puts the token in', async () => {
    const n = await createNotice(deps(), as(writer), { key: 'faq-exchange', kind: 'inline', nameEn: 'FAQ exchange', contentEn: 'Exchange for another size within 7 days of delivery.', placement: { pages: ['faq'] }, ruleId: ids.exchange });
    ids.faqNotice = n.id;
    const r = await refreshConflicts(deps(), A);
    expect(r.added).toBeGreaterThanOrEqual(1);
    const open = await listConflicts(deps(), as(reader));
    const drift = open.find((c) => c.kind === 'TEXT_DRIFT' && c.otherType === 'notice')!;
    expect(drift.fixable).toBe(true);
    expect(drift.detail).toMatchObject({ literal: '7 days', token: '{exchange.windowHours}' });
    expect(await code(fixConflict(deps(), as(writer), drift.id))).toBe('FORBIDDEN');
    await fixConflict(deps(), as(publisher), drift.id);
    const after = await t.prisma.notice.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.contentEn).toBe('Exchange for another size within {exchange.windowHours} hours of delivery.');
    expect(after.version).toBe(2);
    expect((await listConflicts(deps(), as(reader))).some((c) => c.id === drift.id)).toBe(false);
    const closed = await t.prisma.smartRuleConflict.findUniqueOrThrow({ where: { id: drift.id } });
    expect(closed.resolution).toBe('gone');
  });

  it('PR 217: a second delivery rule clashes; the winner is named; the clash can be accepted', async () => {
    const extra = await createRule(deps(), as(writer), { templateId: 'delivery', key: 'delivery-campaign', nameEn: 'Sample campaign charge' });
    ids.deliveryCampaign = extra.id;
    // In the preview the clash shows before it is live.
    const pv = await previewRule(deps(), as(reader), extra.id, { content: withValues(extra.live!, { chargeDhakaCity: 5000, chargeDhakaSubArea: 5000, chargeOutsideDhaka: 5000, freeOver: 100000 }, { status: 'ACTIVE', priority: 5 }) });
    expect(pv.conflicts.filter((c) => c.kind === 'SAME_SLOT').length).toBeGreaterThanOrEqual(3);
    expect(pv.ownerOkNeeded).toBe(true);
    expect(pv.canApprove).toBe(false);
    expect(pv.places.find((p) => p.placement === 'product')).toMatchObject({ change: 'added', before: null });
    await saveDraft(deps(), as(writer), extra.id, { content: withValues(extra.live!, { chargeDhakaCity: 5000, chargeDhakaSubArea: 5000, chargeOutsideDhaka: 5000, freeOver: 100000 }, { status: 'ACTIVE', priority: 5 }) });
    const p = await publishRule(deps(), as(owner), extra.id);
    expect(p.conflicts).toBeGreaterThanOrEqual(3);
    const clash = (await listConflicts(deps(), as(reader), { ruleId: extra.id })).find((c) => c.kind === 'SAME_SLOT')!;
    expect(clash.winnerRuleId).toBe(extra.id);
    expect(clash.detail.decidedBy).toBe('priority');
    await resolveConflict(deps(), as(publisher), clash.id, { resolution: 'keep-order' });
    expect(await code(resolveConflict(deps(), as(publisher), clash.id, { resolution: 'keep-order' }))).toBe('CONFLICT');
    // The winner decides free delivery (its threshold); the charge stays the band's own (follow-up 54, PR 119).
    const won = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.teeV!, quantity: 1 }], bandKey: 'dhaka-city' });
    expect(won.delivery).toMatchObject({ chargeMinor: 8000, freeOverMinor: 100000, remainingMinor: 40000 });
    expect((await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.teeV!, quantity: 2 }], bandKey: 'dhaka-city' })).delivery).toMatchObject({ free: true, chargeMinor: 0, reason: 'FREE_OVER' });
    // Switch it off again (the owner's OK) so the rest of the tests see one delivery rule.
    await setRuleStatus(deps(), as(owner), extra.id, { status: 'PAUSED' });
    await refreshConflicts(deps(), A);
    expect((await listConflicts(deps(), as(reader))).filter((c) => c.kind === 'SAME_SLOT')).toEqual([]);
  });

  it('PR 209: the preview names the places that change and the texts that quote the rule', async () => {
    const r = await getRule(deps(), as(reader), ids.exchange!);
    const next = withValues(r.live!, { windowHours: 48 });
    const pv = await previewRule(deps(), as(reader), r.id, { content: next });
    const product = pv.places.find((p) => p.placement === 'product')!;
    expect(product.change).toBe('changed');
    expect(product.labelEn).toBe('Product page');
    const quoting = pv.quotedBy.find((q) => q.type === 'notice')!;
    expect(quoting.before).toContain('72 hours');
    expect(quoting.after).toContain('48 hours');
    expect(pv.money.map((c) => c.path)).toEqual(['params.windowHours']);
    expect(pv.ownerOkNeeded).toBe(true);
  });

  it('PR 217: "Fix everywhere" for all, on a rule text too (a words-only new version)', async () => {
    const r = await getRule(deps(), as(reader), ids.exchange!);
    const full = r.live!.text.full!;
    await saveDraft(deps(), as(writer), r.id, { content: { ...r.live!, text: { ...r.live!.text, full: { ...full, en: `${full.en}\nAsk within 5 days.` } } } });
    await publishRule(deps(), as(publisher), r.id);
    await refreshConflicts(deps(), A);
    const res = await fixAllConflicts(deps(), as(publisher));
    expect(res.fixed).toBeGreaterThanOrEqual(1);
    const now = await getRule(deps(), as(reader), r.id);
    expect(now.live!.text.full!.en).toContain('Ask within {windowHours} hours.');
    expect(now.texts.full!.en!.text).toContain('Ask within 72 hours.');
  });

  // ---- PR 219 · simulation ---------------------------------------------------------------------------------------------

  it('PR 219: a simulation prices the recent orders with and without the change, and is kept', async () => {
    const r = await getRule(deps(), as(reader), ids.delivery!);
    const res = await simulateRule(deps(), as(reader), r.id, { content: withValues(r.live!, { chargeDhakaCity: 6000, freeOver: 300000 }) });
    expect(res.orders).toBe(3);
    // Each order is charged its band's own figure, as the checkout charges today (follow-up 54): the rule's charge no
    // longer moves it; only the threshold does. Inside Dhaka: 1 polo (80, unchanged), 2 polos (free → 80); outside 120.
    expect(res.changed).toBe(1);
    expect(res.before.deliveryMinor).toBe(8000 + 0 + 12000);
    expect(res.after.deliveryMinor).toBe(8000 + 8000 + 12000);
    expect(res.differenceMinor).toBe(8000);
    expect(res.freeDeliveryBefore).toBe(1);
    expect(res.freeDeliveryAfter).toBe(0);
    expect(res.biggest[0]!.number).toBe('S-1002');
    const wide = await simulateRule(deps(), as(reader), r.id, { days: 120 });
    expect(wide.orders).toBe(4);
    expect(wide.changed).toBe(0);
    expect((await listSimulations(deps(), as(reader), r.id)).map((s) => s.orders)).toEqual([4, 3]);
    overrides.set('rules.simulation.maxOrders', 2);
    expect((await simulateRule(deps(), as(reader), r.id)).capped).toBe(true);
    overrides.delete('rules.simulation.maxOrders');
  });

  // ---- PR 216 · notices ------------------------------------------------------------------------------------------------

  it('PR 216: a pop-up never opens on arrival; it is switched on only when it obeys the rules', async () => {
    const p = await createNotice(deps(), as(writer), {
      key: 'size-help',
      kind: 'popup',
      nameEn: 'Size help',
      titleEn: 'Not sure of your size?',
      contentEn: 'Exchange within {exchange.windowHours} hours.',
      placement: { pages: ['product'] },
      timing: { trigger: 'time', delaySeconds: 0 },
      cta: { labelEn: 'Size guide', href: '/size-guide' },
    });
    expect(p.enabled).toBe(false);
    expect(p.issues).toEqual(expect.arrayContaining(['ARRIVAL_POPUP', 'NO_CAP']));
    expect(await code(setNoticeEnabled(deps(), as(publisher), p.id, { enabled: true }))).toBe('NOTICE_INVALID');
    const fixed = await updateNotice(deps(), as(writer), p.id, { notice: { key: 'size-help', kind: 'popup', nameEn: 'Size help', titleEn: 'Not sure of your size?', contentEn: 'Exchange within {exchange.windowHours} hours.', placement: { pages: ['product'] }, timing: { trigger: 'scroll', scrollPercent: 50 }, frequencyCap: { per: 'week', times: 1 }, cta: { labelEn: 'Size guide', href: '/size-guide' } }, version: 1 });
    expect(fixed.issues).toEqual([]);
    expect(fixed.preview.en).toBe('Exchange within 72 hours.');
    expect(await code(setNoticeEnabled(deps(), as(writer), p.id, { enabled: true }))).toBe('FORBIDDEN');
    await setNoticeEnabled(deps(), as(publisher), p.id, { enabled: true });
    const live = await liveNotices(deps(), { storeId: A, placement: 'product', locale: 'en-BD' });
    expect(live.notices).toEqual([expect.objectContaining({ key: 'size-help', kind: 'popup', title: 'Not sure of your size?', content: 'Exchange within 72 hours.', cta: { label: 'Size guide', href: '/size-guide' } })]);
    expect(live.popup.maxPerVisit).toBe(1);
    expect((await liveNotices(deps(), { storeId: A, placement: 'faq' })).notices).toEqual([]);
    // An unknown token is never shown; the notice cannot be switched on with it.
    const broken = await createNotice(deps(), as(writer), { key: 'broken', kind: 'bar', nameEn: 'Broken', contentEn: 'Free over {delivery.nothing}', placement: { pages: ['announcement'] } });
    expect(broken.issues).toContain('UNKNOWN_TOKEN');
    expect(await code(setNoticeEnabled(deps(), as(publisher), broken.id, { enabled: true }))).toBe('NOTICE_INVALID');
    await archiveNotice(deps(), as(publisher), broken.id, { archived: true });
    expect(await t.prisma.notice.count({ where: { id: broken.id } })).toBe(1);
  });

  // ---- PR 213 · coupons and the "was" price ----------------------------------------------------------------------------

  it('PR 213: a coupon is made off; switching it on is the owner’s OK; its limit holds', async () => {
    const rule = await createRule(deps(), as(writer), { templateId: 'coupon', key: 'welcome-coupon' });
    await saveDraft(deps(), as(writer), rule.id, { content: withValues(rule.live!, { amountOff: 10000, minOrder: 50000 }, { status: 'ACTIVE' }) });
    await publishRule(deps(), as(owner), rule.id);
    expect(await code(createCoupon(deps(), as(writer), { code: 'x', ruleId: rule.id }))).toBe('COUPON_CODE_INVALID');
    expect(await code(createCoupon(deps(), as(writer), { code: 'SAMPLE-ONE', ruleId: ids.exchange }))).toBe('COUPON_RULE_INVALID');
    const c = await createCoupon(deps(), as(writer), { code: 'sample-one', ruleId: rule.id, usageLimit: 1 });
    expect(c).toMatchObject({ code: 'SAMPLE-ONE', enabled: false });
    expect((await checkCoupon(t.prisma, { storeId: A, code: 'sample-one', now: clock })).reason).toBe('OFF');
    expect(await code(setCouponEnabled(deps(), as(publisher), c.id, { enabled: true }))).toBe('OWNER_OK_REQUIRED');
    await setCouponEnabled(deps(), as(owner), c.id, { enabled: true });
    const q = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.poloV!, quantity: 1 }], bandKey: 'dhaka-city', couponCode: 'Sample-One' });
    expect(q.coupon!.ok).toBe(true);
    expect(q.discountMinor).toBe(10000);
    const [o1, o2] = await t.prisma.order.findMany({ where: { storeId: A }, orderBy: { number: 'asc' }, take: 2 });
    await t.prisma.$transaction((tx) => redeemCoupon(tx, { storeId: A, code: 'SAMPLE-ONE', orderId: o1!.id, discountMinor: 10000, now: clock }));
    const again = await t.prisma.$transaction((tx) => redeemCoupon(tx, { storeId: A, code: 'SAMPLE-ONE', orderId: o1!.id, discountMinor: 10000, now: clock }));
    expect(again.replayed).toBe(true);
    expect(await code(t.prisma.$transaction((tx) => redeemCoupon(tx, { storeId: A, code: 'SAMPLE-ONE', orderId: o2!.id, discountMinor: 10000, now: clock })))).toBe('COUPON_NOT_USABLE');
    expect((await t.prisma.coupon.findUniqueOrThrow({ where: { id: c.id } })).usedCount).toBe(1);
    // review R2 (M2): used up, the code is refused to a new bag — but the order that redeemed it, priced again by the
    // team, keeps it unlocked (it is not checked again)
    const usedUp = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.poloV!, quantity: 1 }], bandKey: 'dhaka-city', couponCode: 'Sample-One' });
    expect(usedUp.coupon).toMatchObject({ ok: false, reason: 'USED_UP' });
    expect(usedUp.discountMinor).toBe(0);
    const own = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.poloV!, quantity: 1 }], bandKey: 'dhaka-city', redeemedCoupon: { couponId: c.id, code: 'SAMPLE-ONE', ruleId: rule.id } });
    expect(own.coupon).toMatchObject({ ok: true, code: 'SAMPLE-ONE' });
    expect(own.discountMinor).toBe(10000);
    expect(await code(archiveCoupon(deps(), as(publisher), c.id, { archived: true }))).toBe('RULE_ACTIVE');
  });

  it('PR 112 (S04), SIM-F-009: a coupon says who may use it — a public code works for a guest, a members-only one says so', async () => {
    const rule = await createRule(deps(), as(writer), { templateId: 'coupon', key: 'audience-coupon' });
    await saveDraft(deps(), as(writer), rule.id, { content: withValues(rule.live!, { amountOff: 5000, minOrder: 10000 }, { status: 'ACTIVE' }) });
    await publishRule(deps(), as(owner), rule.id);
    const open = await createCoupon(deps(), as(writer), { code: 'sample-all', ruleId: rule.id });
    expect(open.audience).toBe('ALL'); // the default: existing and new codes stay open to guests
    const members = await createCoupon(deps(), as(writer), { code: 'sample-members', ruleId: rule.id, audience: 'MEMBERS' });
    const guests = await createCoupon(deps(), as(writer), { code: 'sample-guests', ruleId: rule.id, audience: 'GUESTS' });
    expect(await code(createCoupon(deps(), as(writer), { code: 'sample-bad', ruleId: rule.id, audience: 'VIP' }))).toBe('INVALID_INPUT');
    for (const c of [open, members, guests]) await setCouponEnabled(deps(), as(owner), c.id, { enabled: true });
    const member = '00000000-0000-4000-8000-000000000112';
    const check = (code: string, customerId: string | null) => checkCoupon(t.prisma, { storeId: A, code, customerId, now: clock });
    expect((await check('SAMPLE-ALL', null)).ok).toBe(true);
    expect((await check('SAMPLE-ALL', member)).ok).toBe(true);
    expect(await check('SAMPLE-MEMBERS', null)).toMatchObject({ ok: false, reason: 'MEMBERS_ONLY' });
    expect((await check('SAMPLE-MEMBERS', member)).ok).toBe(true);
    expect((await check('SAMPLE-GUESTS', null)).ok).toBe(true);
    expect(await check('SAMPLE-GUESTS', member)).toMatchObject({ ok: false, reason: 'GUESTS_ONLY' });
    // The engine prices a guest's bag with the public code and without the members-only one.
    const guestQuote = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.poloV!, quantity: 1 }], couponCode: 'sample-all' });
    expect(guestQuote.discountMinor).toBeGreaterThanOrEqual(5000);
    const refused = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.poloV!, quantity: 1 }], couponCode: 'sample-members' });
    expect(refused.coupon).toMatchObject({ ok: false, reason: 'MEMBERS_ONLY' });
    for (const c of [open, members, guests]) await setCouponEnabled(deps(), as(owner), c.id, { enabled: false });
  });

  it('PR 213 follow-up, SIM-F-050: a first-order code reads his order history by phone — logged in or not; the order being placed and cancelled ones do not count', async () => {
    const rule = await createRule(deps(), as(writer), { templateId: 'coupon', key: 'first-order-coupon' });
    await saveDraft(deps(), as(writer), rule.id, { content: withValues(rule.live!, { amountOff: 10000, minOrder: 10000 }, { status: 'ACTIVE' }) });
    await publishRule(deps(), as(owner), rule.id);
    const welcome = await createCoupon(deps(), as(writer), { code: 'sample-welcome', ruleId: rule.id, audience: 'FIRST_ORDER' });
    expect(welcome.audience).toBe('FIRST_ORDER');
    await setCouponEnabled(deps(), as(owner), welcome.id, { enabled: true });
    const repeat = '+8801711000501';
    const fresh = '+8801711000502';
    const cancelledOnly = '+8801711000503';
    const placed = (num: string, phone: string, status: 'DELIVERED' | 'CANCELLED' | 'PLACED') =>
      t.prisma.order.create({ data: { storeId: A, number: num, source: 'WEBSITE', currency: 'BDT', placedAt: clock, paymentMethod: 'COD', subtotalMinor: 100000, totalMinor: 100000, idempotencyKey: `idem-${num}`, phone, status } });
    await placed('S-5001', repeat, 'DELIVERED');
    await placed('S-5002', cancelledOnly, 'CANCELLED');
    const check = (phone: string | null) => checkCoupon(t.prisma, { storeId: A, code: 'SAMPLE-WELCOME', phone, customerId: null, now: clock });
    // the WELCOME100 case: he bought before and is not logged in — refused, in words that say why
    expect(await check(repeat)).toMatchObject({ ok: false, reason: 'FIRST_ORDER_ONLY' });
    expect((await check(fresh)).ok).toBe(true);
    expect((await check(cancelledOnly)).ok).toBe(true);
    // the bag before his number is known lets it through; placing checks again with the number
    expect((await check(null)).ok).toBe(true);
    const q = await quoteCart(deps(), { storeId: A, lines: [{ variantId: ids.poloV!, quantity: 1 }], couponCode: 'sample-welcome', phone: repeat });
    expect(q.coupon).toMatchObject({ ok: false, reason: 'FIRST_ORDER_ONLY' });
    // redeeming inside the new order's own transaction: that order itself is not "an earlier order"
    const mine = await placed('S-5003', fresh, 'PLACED');
    const r = await t.prisma.$transaction((tx) => redeemCoupon(tx, { storeId: A, code: 'SAMPLE-WELCOME', orderId: mine.id, phone: fresh, discountMinor: 10000, now: clock }));
    expect(r.replayed).toBe(false);
    const again = await placed('S-5004', fresh, 'PLACED');
    expect(await code(t.prisma.$transaction((tx) => redeemCoupon(tx, { storeId: A, code: 'SAMPLE-WELCOME', orderId: again.id, phone: fresh, discountMinor: 10000, now: clock })))).toBe('COUPON_NOT_USABLE');
    await setCouponEnabled(deps(), as(owner), welcome.id, { enabled: false });
  });

  it('PR 213: the struck "was" price shows only when switched on, from the MRP or the real history', async () => {
    const d = await createRule(deps(), as(writer), { templateId: 'discount', key: 'polo-sale' });
    await saveDraft(deps(), as(writer), d.id, { content: withValues(d.live!, { percentOff: 20 }, { status: 'ACTIVE', startsAt: '2026-10-15T00:00:00.000Z', endsAt: '2026-10-31T00:00:00.000Z', scope: { include: [{ type: 'category', id: ids.polos! }], exclude: [] } }) });
    await publishRule(deps(), as(owner), d.id);
    await t.prisma.priceHistory.create({ data: { storeId: A, variantId: ids.poloV!, priceMinor: 100000, source: 'test', effectiveFrom: new Date('2026-08-01T00:00:00Z') } });
    const off = await discountWasFor(deps(), { storeId: A, variantId: ids.poloV! });
    expect(off).toMatchObject({ priceMinor: 100000, discountedMinor: 80000, wasMinor: null, reason: 'NOT_CHOSEN', ruleKey: 'polo-sale' });
    overrides.set('rules.discount.showWasPrice', true);
    expect(await discountWasFor(deps(), { storeId: A, variantId: ids.poloV! })).toMatchObject({ wasMinor: 100000, reason: 'SHOWN', source: 'PRICE_HISTORY' });
    // CN-009: the real MRP where it exists.
    await t.prisma.productVariant.update({ where: { id: ids.poloV! }, data: { compareAtMinor: 125000 } });
    expect(await discountWasFor(deps(), { storeId: A, variantId: ids.poloV! })).toMatchObject({ wasMinor: 125000, reason: 'SHOWN', source: 'MRP' });
    await t.prisma.productVariant.update({ where: { id: ids.poloV! }, data: { compareAtMinor: null } });
    overrides.delete('rules.discount.showWasPrice');
    expect((await discountWasFor(deps(), { storeId: A, variantId: ids.teeV! }))!.reason).toBe('NO_DISCOUNT');
    // The {endsAt} token reads the window.
    expect(await ruleTextFor(deps(), { storeId: A, key: 'polo-sale', slot: 'short', locale: 'en-BD' })).toMatch(/^20% off these products until .*Oct/);
  });

  it('PR 609: with a floor margin set, the bag and the product page stop the discount at buying price + margin', async () => {
    // The polo-sale rule above gives 20% off (100000 -> 80000). Bought from the ERP at 70000; floor 20% = 84000.
    await t.prisma.productVariant.update({ where: { id: ids.poloV! }, data: { shopPriceMinor: 70000 } });
    const line = [{ variantId: ids.poloV!, quantity: 1 }];
    try {
      expect((await quoteCart(deps(), { storeId: A, lines: line })).discountMinor).toBe(20000);
      overrides.set('catalogue.floor.minMarginPercent', 20);
      const q = await quoteCart(deps(), { storeId: A, lines: line });
      expect([q.discountMinor, q.itemsMinor, q.floorHeld.map((h) => [h.rule.key, h.heldMinor])]).toEqual([16000, 84000, [['polo-sale', 4000]]]);
      expect(await discountWasFor(deps(), { storeId: A, variantId: ids.poloV! })).toMatchObject({ priceMinor: 100000, discountedMinor: 84000 });
      // Another store's floor setting never reaches this store.
      overrides.delete('catalogue.floor.minMarginPercent');
      overrides.set(`catalogue.floor.minMarginPercent@${B}`, 20);
      expect((await quoteCart(deps(), { storeId: A, lines: line })).discountMinor).toBe(20000);
    } finally {
      overrides.delete('catalogue.floor.minMarginPercent');
      overrides.delete(`catalogue.floor.minMarginPercent@${B}`);
      await t.prisma.productVariant.update({ where: { id: ids.poloV! }, data: { shopPriceMinor: null } });
    }
  });

  // ---- jobs and the sample -------------------------------------------------------------------------------------------

  it('the end-date job ends a rule at its end, as a new version', async () => {
    clock = new Date('2026-11-01T00:00:00Z');
    const r = await endExpiredRules(deps(), { storeId: A });
    expect(r.ended).toBe(1);
    const row = await t.prisma.smartRule.findFirstOrThrow({ where: { storeId: A, key: 'polo-sale' } });
    expect(row.status).toBe('ENDED');
    expect(await t.prisma.smartRuleVersion.findFirst({ where: { ruleId: row.id, version: row.version } })).toMatchObject({ changeNote: 'Ended at its end date' });
    expect((await endExpiredRules(deps(), { storeId: A })).ended).toBe(0);
  });

  it('the sample rules go only into the sample store, once', async () => {
    expect(await code(seedSampleRules(deps()))).not.toBe('ok');
    await t.prisma.defaultPackApplication.create({ data: { storeId: B, packKey: SAMPLE_PACK_KEY, version: 1 } });
    const first = await seedSampleRules(deps());
    expect(first).toMatchObject({ storeId: B, rules: 7, notices: 3 });
    expect((await seedSampleRules(deps())).rules).toBe(0);
    const rows = await t.prisma.smartRule.findMany({ where: { storeId: B } });
    expect(rows.find((r) => r.key === 'exchange')!.status).toBe('ACTIVE');
    expect(rows.find((r) => r.key === 'delivery')!.status).toBe('DRAFT');
    expect(await t.prisma.smartRule.count({ where: { storeId: A, key: 'any-polos' } })).toBe(0);
    await refreshConflicts(deps(), B);
    const drift = await listConflicts(deps(), { actor: SYSTEM, storeId: B });
    expect(drift.some((c) => c.kind === 'TEXT_DRIFT' && c.detail.literal === '7 days')).toBe(true);
  });
});
