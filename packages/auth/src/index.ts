// @extas/auth — staff and customer sign-in (PR 15), the permission model (PR 16) and the role builder (PR 495).
// Every admin action is checked on the server (rbac.ts); every change to roles and staff writes the audit log.
export * from './errors';
export * from './catalogue';
export * from './policy';
export * from './password';
export * from './tokens';
export * from './totp';
export * from './audit';
export * from './rbac';
// CN-028 · PR 616: the owner's PIN for the books (books.adjust, books.close).
export * from './pin';
export * from './roles';
export * from './staff-auth';
export * from './ip-allow';
export * from './staff-admin';
export * from './customer-auth';
export * from './owner';
export * from './owner-reset';
export * from './check-account';
export * from './sync';
export { authMessages, authLabel } from './messages';
export type * from './db-types';
