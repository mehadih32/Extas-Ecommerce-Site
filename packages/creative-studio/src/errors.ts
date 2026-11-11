// One error type for every refusal of the creative-studio package (S25). The `code` is stable: the admin API sends
// it and the admin screens turn it into text from their messages file; the package itself writes no visible text.
export type StudioErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  /** `studio.video.enabled` is off, or a product's own tick box is off (Blueprint C8.1: off by default). */
  | 'OFF'
  /** The action's category does not match the product's category (per-category action library). */
  | 'CATEGORY_MISMATCH'
  /** The source still is archived, missing, or not an image (a clip's first frame must be a real still). */
  | 'SOURCE_INVALID'
  /** The job is not in a state that allows this move (e.g. approving a job still PROCESSING). */
  | 'WRONG_STATE'
  /** The provider adapter refused the job (its message is in `details`). */
  | 'PROVIDER_ERROR'
  /** The monthly cap for this job type is reached (Blueprint C7.20 / C8.2: pauses new generations, nothing already approved is touched). */
  | 'CAP_REACHED'
  /** A reel's clip jobs are not all APPROVED yet. */
  | 'CLIPS_NOT_READY'
  /** The campaign overlay's window (`startsAt`/`endsAt`) is invalid (end before start). */
  | 'WINDOW_INVALID'
  /** The creative brief has no chosen direction yet (Blueprint C8.4: nothing is produced before the owner picks one). */
  | 'NO_DIRECTION_CHOSEN'
  /** The export selection names no product, SKU or category. */
  | 'SELECTION_EMPTY';

export class StudioError extends Error {
  readonly code: StudioErrorCode;
  readonly details: string[];

  constructor(code: StudioErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'StudioError';
    this.code = code;
    this.details = details;
  }

  /** HTTP status for the admin API. */
  get status(): number {
    switch (this.code) {
      case 'NOT_FOUND':
        return 404;
      case 'CONFLICT':
      case 'WRONG_STATE':
      case 'CLIPS_NOT_READY':
      case 'NO_DIRECTION_CHOSEN':
        return 409;
      case 'OFF':
      case 'CAP_REACHED':
        return 403;
      case 'PROVIDER_ERROR':
        return 422;
      default:
        return 400;
    }
  }
}

export const isStudioError = (e: unknown): e is StudioError => e instanceof StudioError;
