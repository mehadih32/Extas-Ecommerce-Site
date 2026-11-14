import { describe, expect, it } from 'vitest';
import { expireLegacyCookies, legacyCookieNames, registrableDomain, resetPageHtml } from './legacy-browser';
import { ADMIN_LOGIN } from './admin-nav';

describe('legacyCookieNames', () => {
  it('finds old WordPress/WooCommerce cookie names and ignores our own', () => {
    const header = 'wordpress_logged_in_abc=1; wp-settings-1=x; woocommerce_cart_hash=y; __Host-admin_sess=z; extas_preview=w';
    expect(legacyCookieNames(header)).toEqual(['wordpress_logged_in_abc', 'wp-settings-1', 'woocommerce_cart_hash']);
  });

  it('returns nothing for a header with no legacy cookie, or no header', () => {
    expect(legacyCookieNames('__Host-admin_sess=z')).toEqual([]);
    expect(legacyCookieNames(null)).toEqual([]);
  });
});

describe('expireLegacyCookies', () => {
  it('expires each name for this host and for the whole domain', () => {
    const lines = expireLegacyCookies(['wordpress_test'], 'extas.com.bd');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^wordpress_test=; Path=\/; Max-Age=0/);
    expect(lines[1]).toMatch(/^wordpress_test=; Path=\/; Domain=\.extas\.com\.bd; Max-Age=0/);
  });

  it('skips the domain-wide line when no domain is known', () => {
    expect(expireLegacyCookies(['wordpress_test'], null)).toHaveLength(1);
  });
});

describe('registrableDomain', () => {
  it('strips a leading www and a port', () => {
    expect(registrableDomain('www.extas.com.bd:443')).toBe('extas.com.bd');
    expect(registrableDomain('extas.com.bd')).toBe('extas.com.bd');
  });

  it('is null for an IP literal or a bare single-label host', () => {
    expect(registrableDomain('127.0.0.1')).toBe(null);
    expect(registrableDomain('localhost')).toBe(null);
    expect(registrableDomain(null)).toBe(null);
  });
});

describe('resetPageHtml', () => {
  it('is a plain HTML string with a meta refresh to the admin sign-in and no script tag', () => {
    const html = resetPageHtml();
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain(ADMIN_LOGIN);
    expect(html).not.toContain('<script');
  });
});
