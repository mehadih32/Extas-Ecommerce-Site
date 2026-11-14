// CN-053 (14 Nov 2026, owner) — after a deploy, a tab opened before it may ask for a script or style file of the OLD build
// that the server no longer has. The page then fails (a failed dynamic import, a ChunkLoadError). Instead of a blank page,
// the tab reloads ONCE by itself (a guard in sessionStorage keeps it from ever looping) and shows an "Updating…" line.
export const CHUNK_RELOAD_KEY = 'extas-chunk-reload';
/** A second reload inside this window is refused: it would be a loop. */
export const CHUNK_RELOAD_WINDOW_MS = 60_000; // hardcode-ok: a loop guard window

const PATTERNS = [/ChunkLoadError/i, /Loading chunk [\w-]+ failed/i, /Loading CSS chunk/i, /Failed to fetch dynamically imported module/i, /error loading dynamically imported module/i, /Importing a module script failed/i, /Failed to load chunk/i];

/** True when an error (its name or message) is the "file of an older build is gone" kind. */
export function isChunkError(e: unknown): boolean {
  const text = e instanceof Error ? `${e.name} ${e.message}` : typeof e === 'string' ? e : e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  return PATTERNS.some((re) => re.test(text));
}

/** True when a reload is allowed now (`last` = the stored time of the previous one). */
export function mayReloadForChunk(last: string | null, now: number): boolean {
  const t = last === null ? NaN : Number(last);
  return !Number.isFinite(t) || now - t > CHUNK_RELOAD_WINDOW_MS || now < t;
}

interface Win {
  addEventListener(type: string, fn: (e: never) => void): void;
  removeEventListener(type: string, fn: (e: never) => void): void;
  sessionStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  location: { reload(): void };
  document: { documentElement: { lang?: string }; body: { appendChild(n: unknown): unknown }; createElement(t: string): { textContent: string | null; setAttribute(k: string, v: string): void } };
}

/** Listens for chunk errors; the first one reloads the page once. Returns the function that stops listening. */
export function installChunkRecovery(win: Win, words: { bn: string; en: string }, now: () => number = Date.now): () => void {
  let done = false;
  const handle = (e: unknown) => {
    if (done || !isChunkError(e)) return;
    let last: string | null = null;
    try {
      last = win.sessionStorage?.getItem(CHUNK_RELOAD_KEY) ?? null;
    } catch {
      last = String(now()); // storage refused: never reload by itself, so a failing page can never loop
    }
    if (!mayReloadForChunk(last, now())) return;
    try {
      win.sessionStorage?.setItem(CHUNK_RELOAD_KEY, String(now()));
    } catch {
      return;
    }
    done = true;
    try {
      const line = win.document.createElement('div');
      line.setAttribute('role', 'status');
      line.setAttribute('data-testid', 'updating');
      line.setAttribute('style', 'position:fixed;left:0;right:0;top:0;padding:8px 12px;text-align:center;font:14px system-ui,sans-serif;background:#111;color:#fff;z-index:2147483647');
      line.textContent = win.document.documentElement.lang === 'bn' ? words.bn : words.en;
      win.document.body.appendChild(line);
    } catch {
      // the line is a courtesy; the reload is what matters
    }
    win.location.reload();
  };
  const onError = (ev: { error?: unknown; message?: unknown }) => handle(ev.error ?? ev.message);
  const onRejection = (ev: { reason?: unknown }) => handle(ev.reason);
  win.addEventListener('error', onError as never);
  win.addEventListener('unhandledrejection', onRejection as never);
  return () => {
    win.removeEventListener('error', onError as never);
    win.removeEventListener('unhandledrejection', onRejection as never);
  };
}
