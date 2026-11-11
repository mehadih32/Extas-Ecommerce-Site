// CN-043 (11 Nov 2026, owner) — on every visit, expire any old WordPress/WooCommerce cookie the browser still carries
// from the shop that used to run on this same domain before go-live (lib/legacy-browser.ts). Name-matched only, so
// this never touches our own cookies. Skips static assets; everything else (the shop and the admin alike) is checked,
// since a stale WordPress cookie can reach either.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { expireLegacyCookies, legacyCookieNames, registrableDomain } from '@/lib/legacy-browser';

export function proxy(request: NextRequest) {
  const names = legacyCookieNames(request.headers.get('cookie'));
  if (!names.length) return NextResponse.next();
  const response = NextResponse.next();
  const domain = registrableDomain(request.headers.get('host'));
  for (const line of expireLegacyCookies(names, domain)) response.headers.append('set-cookie', line);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
