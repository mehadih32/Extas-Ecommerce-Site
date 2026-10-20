// PR 508 — a fresh installation's mother store. Every admin page and the settings at store level work on the mother
// store (MOTHER_STORE_ID), so an installation without one cannot open its admin. The migrate step makes it before the
// default pack: the address comes from the pack, language, time zone and currency from the settings registry's
// defaults, and the name stays empty, because the shop's name is owner data (PR 509) that the owner types in later.
// It starts as a draft. Running it again changes nothing; an installation whose stores have no mother store is never
// guessed at — the run refuses and says so.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { registry } from '@extas/settings';
import { lockSeed } from './lock';
import { defaultPack, type PackData } from './pack';

export class MotherStoreRefused extends Error {}

export interface MotherStoreReport {
  storeId: number;
  created: boolean;
}

export async function ensureMotherStore(prisma: PrismaClient, pack: PackData = defaultPack): Promise<MotherStoreReport> {
  return prisma.$transaction(async (tx) => {
    await lockSeed(tx);
    const mother = await tx.store.findFirst({ where: { isPrimary: true }, select: { id: true } });
    if (mother) return { storeId: mother.id, created: false };
    const slug = pack.motherStore?.slug;
    if (!slug) throw new MotherStoreRefused('the default pack names no mother-store address (motherStore.slug)');
    if ((await tx.store.count()) > 0) {
      throw new MotherStoreRefused('stores exist but none is the mother store: mark one in the admin, nothing was made');
    }
    const store = await tx.store.create({
      data: {
        id: MOTHER_STORE_ID,
        slug,
        name: '',
        status: 'DRAFT',
        isPrimary: true,
        defaultLocale: registry['store.locale'].default,
        timezone: registry['store.timeZone'].default,
        currency: registry['store.currency'].default,
      },
      select: { id: true },
    });
    // The id was given, so the sequence moves past it for the next store.
    await tx.$queryRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Store"', 'id'), (SELECT max(id) FROM "Store"))::text AS s`);
    return { storeId: store.id, created: true };
  });
}
