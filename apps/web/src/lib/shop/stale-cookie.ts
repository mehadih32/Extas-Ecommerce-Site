// CN-053 (14 Nov 2026) — a customer cookie that no longer belongs to a session (expired, signed out elsewhere) never causes
// an error page: the shop already treats it as "not signed in" (signedIn() in account.ts), and the sign-in page expires
// that one cookie so the browser starts clean. Only our own customer cookie; a database that cannot be read leaves it.
import { currentCustomer } from '@extas/accounts';
import { accountDeps, clearAccountCookie } from './account';
import { CUSTOMER_COOKIE_NAME } from './customer-cookie';
import { shopStoreId } from './store-id';

/** The Set-Cookie line that expires the dead customer cookie, or null when it is fine or the check could not run. */
export async function staleCustomerCookieLine(value: string | null): Promise<string | null> {
  if (!value) return null;
  const deps = accountDeps();
  if (!deps) return null;
  try {
    return (await currentCustomer(deps, value, shopStoreId())) ? null : clearAccountCookie(CUSTOMER_COOKIE_NAME);
  } catch {
    return null;
  }
}
