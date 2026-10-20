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
export * from './roles';
export * from './staff-auth';
export * from './staff-admin';
export * from './customer-auth';
export * from './owner';
export * from './owner-reset';
export * from './sync';
export { authMessages, authLabel } from './messages';
export type * from './db-types';
