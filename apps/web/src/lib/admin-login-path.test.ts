// CN-053 — the sign-in address and what the proxy does with the admin's addresses (pure rules).
import { registry } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { adminDoor, adminLoginPath, loginPathOf, isLoginPageFolder } from './admin-login-path';
import { ADMIN_LOGIN, ADMIN_LOGIN_PAGE, safeNext } from './admin-nav';

describe('admin.loginPath', () => {
  it('the constant used by redirects is the setting\'s own default', () => {
    expect(ADMIN_LOGIN).toBe(`/${registry['admin.loginPath'].default}`);
  });
  it('an unusable value falls back to the default; a good one is used', () => {
    expect(loginPathOf(undefined)).toBe('/access');
    expect(loginPathOf('admin')).toBe('/access');
    expect(loginPathOf('/x')).toBe('/access');
    expect(loginPathOf('staff-door')).toBe('/staff-door');
  });
  it('without a database the address is the default', async () => {
    expect(await adminLoginPath(1)).toBe('/access');
  });
  it('the sign-in folder is never a "come back here" target', () => {
    expect(safeNext('/admin/login')).toBe('/admin');
    expect(safeNext('/admin/orders')).toBe('/admin/orders');
    expect(isLoginPageFolder('/admin/login/x')).toBe(true);
    expect(isLoginPageFolder('/admin/loginx')).toBe(false);
  });
});

describe('adminDoor', () => {
  const door = (p: string, cookie = false, internal = false, login = '/access') => adminDoor(p, login, cookie, internal);
  it('the sign-in address serves the form, signed in or not', () => {
    expect(door('/access')).toBe('login');
    expect(door('/access', true)).toBe('login');
    expect(door('/staff-door', false, false, '/staff-door')).toBe('login');
  });
  it('/admin/login and a cookie-less /admin are hidden', () => {
    expect(door(ADMIN_LOGIN_PAGE, true)).toBe('hide');
    expect(door('/admin')).toBe('hide');
    expect(door('/admin/orders')).toBe('hide');
    expect(door('/admin/orders', true)).toBe('pass');
  });
  it('the proxy\'s own rewrite passes; the shop passes', () => {
    expect(door(ADMIN_LOGIN_PAGE, false, true)).toBe('pass');
    expect(door('/admin/missing', false, true)).toBe('pass');
    expect(door('/bag')).toBe('pass');
    expect(door('/administrator')).toBe('pass');
  });
  it('the default address, after the owner moved it, sends a person with an admin cookie on and hides itself from the rest', () => {
    expect(door('/access', true, false, '/staff-door')).toBe('moved');
    expect(door('/access', false, false, '/staff-door')).toBe('pass'); // the shop's own 404 follows
  });
});
