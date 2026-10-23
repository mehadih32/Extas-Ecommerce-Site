// PR 72 — test helpers (never used by the shop): an in-memory stand-in for the calls search makes to Meilisearch's HTTP
// API, for this package's tests and the background worker's (packages/jobs). Search there: every word the start of a
// stored word.
/** Meilisearch's HTTP API, the calls search makes, in memory (search: every word the start of a stored word). */
export function fakeMeili() {
  const indexes = new Map<string, { docs: Map<string, Record<string, unknown>>; settings: Record<string, unknown> }>();
  const tasks = new Map<number, { status: string; error: { code: string; message: string } | null }>();
  let n = 0;
  let down = false;
  const calls: string[] = [];
  const task = (error: { code: string; message: string } | null = null) => {
    n += 1;
    tasks.set(n, { status: error ? 'failed' : 'succeeded', error });
    return { taskUid: n };
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    if (down) throw new Error('connect ECONNREFUSED');
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push(`${method} ${url.pathname}`);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'tasks') return json(200, tasks.get(Number(parts[1])));
    if (parts[0] !== 'indexes') return json(404, { code: 'not_found' });
    if (parts.length === 1 && method === 'POST') {
      if (indexes.has(body.uid)) return json(202, task({ code: 'index_already_exists', message: 'exists' }));
      indexes.set(body.uid, { docs: new Map(), settings: {} });
      return json(202, task());
    }
    const ix = indexes.get(parts[1]!);
    if (parts[2] === 'settings') {
      if (!ix) return json(404, { code: 'index_not_found' });
      ix.settings = { ...ix.settings, ...body };
      return json(202, task());
    }
    if (parts[2] === 'documents' && parts[3] === 'delete') {
      const m = /^v != "(.+)"$/.exec(body.filter);
      for (const [id, d] of ix!.docs) if (m && d.v !== m[1]) ix!.docs.delete(id);
      return json(202, task());
    }
    if (parts[2] === 'documents' && method === 'POST') {
      const target = ix ?? { docs: new Map(), settings: {} };
      indexes.set(parts[1]!, target);
      for (const d of body) target.docs.set(String(d.id), d);
      return json(202, task());
    }
    if (parts[2] === 'documents' && method === 'GET') {
      const d = ix?.docs.get(parts[3]!);
      return d ? json(200, d) : json(404, { code: 'document_not_found' });
    }
    if (parts[2] === 'search') {
      if (!ix) return json(404, { code: 'index_not_found' });
      const kind = /kind = "(\w+)"/.exec(body.filter ?? '')?.[1];
      const qs = String(body.q).split(' ').filter(Boolean);
      const hits = [...ix.docs.values()]
        .filter((d) => !kind || d.kind === kind)
        .filter((d) => {
          const ws = ['nameEn', 'nameBn', 'category', 'colours', 'more'].flatMap((k) => String(d[k] ?? '').split(' '));
          return qs.every((q) => ws.some((w) => w.startsWith(q)));
        })
        .sort((a, b) => Number(b.rank) - Number(a.rank))
        .slice(0, body.limit ?? 20)
        .map((d) => ({ id: d.id }));
      return json(200, { hits });
    }
    return json(404, { code: 'not_found' });
  }) as typeof fetch;
  return { fetch: fetchFn, indexes, calls, setDown: (v: boolean) => (down = v) };
}
