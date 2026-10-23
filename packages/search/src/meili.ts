// PR 72 — a small Meilisearch client (HTTP, no SDK): the few calls search and its indexer need. The server's address
// and key come from the environment the server writes (infra/server/steps/09-stack.sh: MEILI_URL, MEILI_MASTER_KEY in
// app-connections.env, read by the web app and the worker); without them search runs on PostgreSQL (`fromEnv` → null).
// Every call has a time limit; a call that fails throws MeiliError, and the caller falls back.

export interface MeiliConfig {
  url: string;
  key: string;
  /** Tests hand in their own fetch. */
  fetch?: typeof fetch;
}

/** The server's Meilisearch, or null when it is not configured. */
export function meiliFromEnv(env: Record<string, string | undefined> = process.env): MeiliConfig | null {
  const url = env.MEILI_URL?.trim();
  const key = env.MEILI_MASTER_KEY?.trim();
  return url && key && /^https?:\/\//.test(url) ? { url: url.replace(/\/+$/, ''), key } : null;
}

export class MeiliError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'MeiliError';
  }
}

export interface MeiliTask {
  taskUid: number;
}

export interface MeiliSearchQuery {
  q: string;
  filter?: string;
  limit?: number;
  attributesToRetrieve?: string[];
  matchingStrategy?: 'all' | 'last' | 'frequency';
}

export class Meili {
  private readonly doFetch: typeof fetch;

  constructor(
    private readonly cfg: MeiliConfig,
    private readonly timeoutMs: number,
  ) {
    this.doFetch = cfg.fetch ?? fetch;
  }

  async request<T>(method: string, path: string, body?: unknown, timeoutMs = this.timeoutMs): Promise<T> {
    let res: Response;
    try {
      res = await this.doFetch(`${this.cfg.url}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.cfg.key}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new MeiliError(`search server unreachable: ${e instanceof Error ? e.message : String(e)}`, null, null);
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const j = (json ?? {}) as { message?: string; code?: string };
      throw new MeiliError(j.message ?? `search server answered ${res.status}`, res.status, j.code ?? null);
    }
    return json as T;
  }

  /** One document, or null when the index or the document does not exist. */
  async getDocument<T>(index: string, id: string | number): Promise<T | null> {
    try {
      return await this.request<T>('GET', `/indexes/${encodeURIComponent(index)}/documents/${encodeURIComponent(String(id))}`);
    } catch (e) {
      if (e instanceof MeiliError && e.status === 404) return null;
      throw e;
    }
  }

  async search(index: string, query: MeiliSearchQuery): Promise<Array<Record<string, unknown>>> {
    const r = await this.request<{ hits?: Array<Record<string, unknown>> }>('POST', `/indexes/${encodeURIComponent(index)}/search`, query);
    return r?.hits ?? [];
  }

  createIndex(index: string, primaryKey: string): Promise<MeiliTask> {
    return this.request<MeiliTask>('POST', '/indexes', { uid: index, primaryKey });
  }

  updateSettings(index: string, settings: Record<string, unknown>): Promise<MeiliTask> {
    return this.request<MeiliTask>('PATCH', `/indexes/${encodeURIComponent(index)}/settings`, settings);
  }

  addDocuments(index: string, docs: readonly Record<string, unknown>[]): Promise<MeiliTask> {
    return this.request<MeiliTask>('POST', `/indexes/${encodeURIComponent(index)}/documents?primaryKey=id`, docs);
  }

  deleteByFilter(index: string, filter: string): Promise<MeiliTask> {
    return this.request<MeiliTask>('POST', `/indexes/${encodeURIComponent(index)}/documents/delete`, { filter });
  }

  /**
   * Waits until a task is done. Throws when it failed — except for the error codes the caller expects (an index that
   * already exists is not a failure when making sure it does).
   */
  async waitTask(task: MeiliTask, waitMs: number, okCodes: readonly string[] = [], pollMs = 100): Promise<void> {
    const until = Date.now() + waitMs;
    for (;;) {
      const t = await this.request<{ status: string; error?: { code?: string; message?: string } | null }>('GET', `/tasks/${task.taskUid}`);
      if (t.status === 'succeeded') return;
      if (t.status === 'failed' || t.status === 'canceled') {
        if (t.error?.code && okCodes.includes(t.error.code)) return;
        throw new MeiliError(t.error?.message ?? `search server task ${task.taskUid} ${t.status}`, null, t.error?.code ?? null);
      }
      if (Date.now() > until) throw new MeiliError(`search server task ${task.taskUid} still ${t.status} after ${waitMs} ms`, null, 'timeout');
      await new Promise((r) => setTimeout(r, pollMs));
      pollMs = Math.min(pollMs * 2, 1000);
    }
  }
}
