// One error type for every refusal of the auth package. The `code` is stable: the API sends it, and the admin screens
// turn it into text from their messages file (the package itself writes no visible text).
export type AuthErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'TWO_FACTOR_SETUP_REQUIRED'
  | 'INVALID_INPUT'
  | 'WEAK_PASSWORD'
  | 'WRONG_PASSWORD'
  | 'WRONG_CODE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ESCALATION'
  | 'LAST_OWNER'
  | 'SYSTEM_ROLE'
  | 'SELF'
  | 'VAULT_NOT_CONFIGURED';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly details: string[];

  constructor(code: AuthErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'AuthError';
    this.code = code;
    this.details = details;
  }
}

/** HTTP status for each refusal (used by the admin API). */
export function httpStatus(code: AuthErrorCode): number {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 401;
    case 'FORBIDDEN':
    case 'PASSWORD_CHANGE_REQUIRED':
    case 'TWO_FACTOR_SETUP_REQUIRED':
    case 'ESCALATION':
    case 'LAST_OWNER':
    case 'SYSTEM_ROLE':
    case 'SELF':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'VAULT_NOT_CONFIGURED':
      return 503;
    default:
      return 400;
  }
}
