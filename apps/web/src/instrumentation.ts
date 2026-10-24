// Next.js calls `register` once when a server process starts. PR 602: the cache starts listening here — to the
// catalogue's, the stock's and the settings' changes in this process and to the other processes' clears over Redis —
// so no change is missed before the first page is drawn. Without a database it does nothing.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startCache } = await import('./lib/cache');
  startCache();
}
