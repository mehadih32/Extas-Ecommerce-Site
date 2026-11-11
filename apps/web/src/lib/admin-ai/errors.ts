// S15 · PR 304 — the AI 360 admin API's one error shape, shared by every admin-ai module (control-room.ts,
// model-picks.ts, ...) so control-room-api.ts catches and reports a 404/422 from any of them the same way. Split
// out in PR 307 so model-picks.ts does not need to import control-room.ts (which, from PR 307 on, imports
// model-picks.ts itself) — this file sits below both, so neither import cycles back through the other.
export class AiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];
  constructor(status: number, code: string, details: string[] = []) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isAiError(e: unknown): e is AiError {
  return e instanceof AiError;
}
