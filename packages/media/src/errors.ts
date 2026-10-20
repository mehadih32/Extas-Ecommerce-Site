// One error type for every refusal of the media package. The `code` is stable: the API sends it and the admin screens
// turn it into text from their messages file (the package writes no visible text). `details` names fields or missing
// photo kinds, never a file's content.
export type MediaErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_AN_IMAGE'
  | 'TYPE_NOT_ALLOWED'
  | 'TOO_LARGE'
  | 'TOO_SMALL'
  | 'NOT_FOUND'
  | 'ARCHIVED'
  | 'STILL_IN_USE'
  | 'PHOTOS_MISSING'
  | 'NO_WATERMARK_TEXT'
  | 'NOT_RENDERED';

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  readonly details: string[];

  constructor(code: MediaErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'MediaError';
    this.code = code;
    this.details = details;
  }
}

export function mediaHttpStatus(code: MediaErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'TOO_LARGE':
      return 413;
    case 'TYPE_NOT_ALLOWED':
    case 'NOT_AN_IMAGE':
      return 415;
    case 'ARCHIVED':
    case 'STILL_IN_USE':
    case 'PHOTOS_MISSING':
      return 409;
    case 'NO_WATERMARK_TEXT':
    case 'NOT_RENDERED':
      return 503;
    default:
      return 400;
  }
}
