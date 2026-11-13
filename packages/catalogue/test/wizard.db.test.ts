// S28 · PR 685 — the wizard's memory on a real PostgreSQL: who may remember a step, only drafts, the facts, resume.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { rememberWizardStep, wizardDrafts, wizardView, type CatalogueDeps, type SettingsReader, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('add-product wizard on PostgreSQL (PR 685)', () => {
  let t: TestDatabase;
  let A = 0;
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings });
  const as = (actor: Actor): Who => ({ actor, storeId: A });
  let editor: Actor;
  let reader: Actor;
  let draft = '';
  let live = '';

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_wizard');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, {
        key: email.split('@')[0]!,
        nameEn: email,
        nameBn: email,
        permissions: perms,
      });
      const u = await t.prisma.staffUser.create({
        data: { email, displayName: email, passwordHash: 'not-a-login' },
      });
      await t.prisma.staffRoleAssignment.create({
        data: { staffUserId: u.id, roleId: role.id, storeId: A },
      });
      return { staffUserId: u.id };
    };
    editor = await staff('w-editor@example.com', ['catalogue.read', 'catalogue.write']);
    reader = await staff('w-reader@example.com', ['catalogue.read']);
    const cat = await t.prisma.category.create({
      data: { storeId: A, slug: 'w-polo', nameEn: 'Polo' },
    });
    draft = (
      await t.prisma.product.create({
        data: {
          storeId: A,
          slug: 'w-draft',
          nameEn: 'Draft polo',
          categoryId: cat.id,
          status: 'DRAFT',
        },
      })
    ).id;
    live = (
      await t.prisma.product.create({
        data: {
          storeId: A,
          slug: 'w-live',
          nameEn: 'Live polo',
          status: 'PUBLISHED',
        },
      })
    ).id;
  }, 300_000);
  afterAll(async () => t?.drop());

  it('starts with nothing remembered and resumes at the first open step', async () => {
    const v = await wizardView(deps(), as(reader), draft);
    expect(v.state).toBeNull();
    expect(v.facts).toMatchObject({
      hasName: true,
      hasCategory: true,
      colours: 0,
      photos: 0,
    });
    expect(v.done[0]).toBe(true); // step 2
    expect(v.resumeStep).toBe(3);
  });

  it('only a writer remembers a step, only 2-8, only on a draft', async () => {
    expect(await code(rememberWizardStep(deps(), as(reader), draft, 3))).toBe('FORBIDDEN');
    expect(await code(rememberWizardStep(deps(), as(editor), draft, 1))).toBe('INVALID_INPUT');
    expect(await code(rememberWizardStep(deps(), as(editor), draft, 9))).toBe('INVALID_INPUT');
    expect(await code(rememberWizardStep(deps(), as(editor), draft, '3'))).toBe('INVALID_INPUT');
    expect(await code(rememberWizardStep(deps(), as(editor), live, 3))).toBe('CONFLICT');
    expect(await code(rememberWizardStep(deps(), as(editor), '00000000-0000-7000-8000-000000000000', 3))).toBe('NOT_FOUND');
  });

  it('remembers the step and the furthest one, and lists the draft to continue', async () => {
    await rememberWizardStep(deps(), as(editor), draft, 5);
    await rememberWizardStep(deps(), as(editor), draft, 4);
    const v = await wizardView(deps(), as(reader), draft);
    expect(v.state).toMatchObject({ step: 4, furthest: 5 });
    expect(v.resumeStep).toBe(4);
    const rows = await wizardDrafts(deps(), as(reader));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productId: draft,
      step: 4,
      furthest: 5,
      nameEn: 'Draft polo',
    });
  });
});
