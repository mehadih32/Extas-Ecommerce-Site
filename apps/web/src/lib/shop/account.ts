// PR 130 — customer accounts on the server side of the shop: the account services' dependencies (the database, the
// settings and the SMS sender: the mock until the gateway's key arrives), the two cookies, and the signed-in customer
// of a page. Customers are their own identity (PR 15): their cookie never opens the admin, the staff's never the shop.
//
// - `__Host-extas_c`: the session token (only its hash is stored). SameSite=Lax, so a link from an SMS or WhatsApp
//   opens the account signed in; every state change is still same-site only (sameOrigin).
// - `__Host-extas_dev`: a random token that names this browser as a device the account has seen (PR 130's code on a
//   new device). Not a login on its own.
// Without a database (CI, `next build`) or when it is slow, a page draws signed out — never an error.
import { randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { currentCustomer, type AccountsDeps } from '@extas/accounts';
import { createConnections, smsAdapters, type SmsSender } from '@extas/adapters';
import type { CustomerAuth } from '@extas/auth';
import { getPrisma } from '@extas/db/client';
import { adminDeps, readCookie } from '../admin-auth';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import type { AccountApiDeps } from './account-api';
import { shopStoreId } from './context';
import { shopT } from './dict';

export const CUSTOMER_COOKIE = '__Host-extas_c';
export const DEVICE_COOKIE = '__Host-extas_dev';

/** The account services' dependencies, or null without a database. */
export function accountDeps(): AccountsDeps | null {
  const resolver = settingsResolver();
  if (!resolver) return null;
  const db = getPrisma();
  return {
    db,
    settings: resolver,
    async sms(storeId) {
      const [testSeconds, cacheSeconds] = await Promise.all([resolver.value('system.integrationTestTimeoutSeconds'), resolver.value('system.integrationKeyCacheSeconds')]);
      const vault = adminDeps()?.vault ?? { get: async () => null };
      const connections = createConnections({ db, vault, adapters: smsAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
      const c = await connections.use<SmsSender>('SMS', { storeId });
      return { sender: c.api, mode: c.mode };
    },
  };
}

/** The account API's dependencies: the services, the store, and the shop's name for the SMS. */
export function accountApiDeps(): AccountApiDeps | null {
  const accounts = accountDeps();
  if (!accounts) return null;
  const storeId = shopStoreId();
  return {
    accounts,
    storeId,
    async storeName() {
      const own = (await accounts.settings.value('store.name', { storeId }))?.trim();
      if (own) return own;
      const row = await accounts.db.store.findUnique({ where: { id: storeId }, select: { name: true } });
      return row?.name?.trim() || shopT('en')('brand.fallback');
    },
  };
}

/** An httpOnly, Secure, SameSite=Lax cookie until `expiresAt` (Max-Age 0 clears it). */
export function accountCookie(name: string, value: string, expiresAt: Date, now: Date = new Date()): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const clearAccountCookie = (name: string): string => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** A new device token (sent once, kept by the browser). */
export const newDeviceToken = (): string => randomBytes(32).toString('base64url');

/** The signed-in customer of a request (an API route), or null. */
export async function customerOfRequest(request: Request, deps: AccountsDeps | null, storeId: number = shopStoreId()): Promise<CustomerAuth | null> {
  const token = readCookie(request, CUSTOMER_COOKIE);
  if (!deps || !token) return null;
  try {
    return await withTimeout(currentCustomer(deps, token, storeId), settingsTimeoutMs() * 2);
  } catch (e) {
    console.warn(`shop: the account is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/** The signed-in customer of the page being drawn, or null (once per request). */
export const signedIn = cache(async (): Promise<CustomerAuth | null> => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  const deps = token ? accountDeps() : null;
  if (!deps || !token) return null;
  try {
    return await withTimeout(currentCustomer(deps, token, shopStoreId()), settingsTimeoutMs() * 2);
  } catch (e) {
    console.warn(`shop: the account is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
});
