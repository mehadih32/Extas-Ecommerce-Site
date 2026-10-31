// S19 · PR 395 — a stand-in for Google (the device sign-in and the parts of Drive the shop uses), as a `fetch`. The
// tests drive it, and the practice mode (MOCK) of the Drive connection runs on one, so the Backups screen works before
// the owner has a Google client. It keeps everything in memory and never touches the network.
//   fake.approve(userCode, email)  the owner pressed Allow at google.com/device; fake.deny(userCode) he pressed Deny
//   fake.addFolder / fake.addFile  backups the server's copy (rclone) would have put there
import { DRIVE_SCOPE, FOLDER_MIME, type DriveFile } from './client';

interface Device {
  clientId: string;
  userCode: string;
  state: 'pending' | 'allowed' | 'denied' | 'used';
  email?: string;
  expiresAt: number;
}

interface Item extends DriveFile {
  parents: string[];
  trashed: boolean;
  owner: string;
}

export interface FakeGoogleOptions {
  /** Client ids Google knows, with their secrets (a "TVs and Limited Input devices" client each). */
  clients?: Record<string, string>;
  /** Bytes each account may hold; absent = no limit. */
  quotaBytes?: number;
}

export function createFakeGoogle(opts: FakeGoogleOptions = {}) {
  const clients = new Map(Object.entries(opts.clients ?? {}));
  const devices = new Map<string, Device>();
  const refresh = new Map<string, { email: string; clientId: string }>();
  const access = new Map<string, { email: string; clientId: string }>();
  const items = new Map<string, Item>();
  const calls: string[] = [];
  let n = 0;
  const id = (p: string) => `${p}${(++n).toString(36).padStart(6, '0')}`;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  async function formOf(init?: RequestInit): Promise<URLSearchParams> {
    const b = init?.body;
    return b instanceof URLSearchParams ? b : new URLSearchParams(String(b ?? ''));
  }

  function who(init?: RequestInit): { email: string; clientId: string } | null {
    const h = new Headers(init?.headers);
    const t = (h.get('authorization') ?? '').replace(/^Bearer /, '');
    return access.get(t) ?? null;
  }

  /** drive.file: an app sees only what its own client made for that account. */
  const visible = (it: Item, u: { email: string; clientId: string }) => it.owner === `${u.email}|${u.clientId}` && !it.trashed;

  function matches(it: Item, q: string): boolean {
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    if (parent && !it.parents.includes(parent)) return false;
    const label = /appProperties has \{ key='([^']+)' and value='([^']+)' \}/.exec(q);
    if (label && it.appProperties?.[label[1]!] !== label[2]) return false;
    if (q.includes(`mimeType = '${FOLDER_MIME}'`) && it.mimeType !== FOLDER_MIME) return false;
    return true;
  }

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname;
    calls.push(`${method} ${path}`);

    if (path.endsWith('/device/code')) {
      const f = await formOf(init);
      if (!clients.has(f.get('client_id') ?? '')) return json({ error: 'invalid_client', error_description: 'The OAuth client was not found.' }, 401);
      if (f.get('scope') !== DRIVE_SCOPE) return json({ error: 'invalid_scope' }, 400);
      const deviceCode = id('dev-');
      const userCode = `${String.fromCharCode(65 + (n % 26))}BCD-EF${n.toString().padStart(2, '0')}`;
      devices.set(deviceCode, { clientId: f.get('client_id')!, userCode, state: 'pending', expiresAt: Date.now() + 1800_000 });
      return json({ device_code: deviceCode, user_code: userCode, verification_url: 'https://www.google.com/device', expires_in: 1800, interval: 5 });
    }
    if (path.endsWith('/token')) {
      const f = await formOf(init);
      const cid = f.get('client_id') ?? '';
      if (!clients.has(cid) || clients.get(cid) !== f.get('client_secret')) return json({ error: 'invalid_client' }, 401);
      if (f.get('grant_type') === 'refresh_token') {
        const r = refresh.get(f.get('refresh_token') ?? '');
        if (!r || r.clientId !== cid) return json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
        const t = id('at-');
        access.set(t, r);
        return json({ access_token: t, expires_in: 3599, token_type: 'Bearer' });
      }
      const d = devices.get(f.get('device_code') ?? '');
      if (!d || d.clientId !== cid) return json({ error: 'invalid_grant' }, 400);
      if (d.expiresAt < Date.now()) return json({ error: 'expired_token' }, 400);
      if (d.state === 'pending') return json({ error: 'authorization_pending' }, 428);
      if (d.state === 'denied') return json({ error: 'access_denied' }, 403);
      if (d.state === 'used') return json({ error: 'invalid_grant' }, 400);
      d.state = 'used';
      const rt = id('rt-');
      const at = id('at-');
      refresh.set(rt, { email: d.email!, clientId: cid });
      access.set(at, { email: d.email!, clientId: cid });
      return json({ access_token: at, refresh_token: rt, expires_in: 3599, scope: DRIVE_SCOPE, token_type: 'Bearer' });
    }
    if (path.endsWith('/revoke')) {
      refresh.delete(url.searchParams.get('token') ?? '');
      return json({});
    }

    const u = who(init);
    if (!u) return json({ error: { message: 'Request had invalid authentication credentials.' } }, 401);
    if (path.endsWith('/drive/v3/about')) {
      const used = [...items.values()].filter((i) => i.owner.startsWith(`${u.email}|`)).reduce((s, i) => s + Number(i.size ?? 0), 0);
      return json({ user: { emailAddress: u.email }, storageQuota: opts.quotaBytes ? { limit: String(opts.quotaBytes), usage: String(used) } : { usage: String(used) } });
    }
    const one = /\/drive\/v3\/files\/([^/]+)$/.exec(path);
    if (one) {
      const it = items.get(decodeURIComponent(one[1]!));
      if (!it || it.owner !== `${u.email}|${u.clientId}`) return json({ error: { message: 'File not found.' } }, 404);
      if (method === 'DELETE') {
        items.delete(it.id);
        return new Response(null, { status: 204 });
      }
      return json({ ...it, trashed: it.trashed });
    }
    if (path.endsWith('/drive/v3/files')) {
      if (method === 'POST') {
        const b = JSON.parse(String(init?.body ?? '{}')) as { name: string; mimeType?: string; parents?: string[]; appProperties?: Record<string, string> };
        const it: Item = { id: id('f-'), name: b.name, mimeType: b.mimeType, parents: b.parents ?? ['root'], appProperties: b.appProperties, createdTime: new Date(Date.now() + n).toISOString(), trashed: false, owner: `${u.email}|${u.clientId}` };
        items.set(it.id, it);
        return json(it);
      }
      const q = url.searchParams.get('q') ?? '';
      const files = [...items.values()]
        .filter((it) => visible(it, u) && matches(it, q))
        .sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? ''))
        .map(({ parents: _p, trashed: _t, owner: _o, ...f }) => f);
      return json({ files });
    }
    return json({ error: { message: `fake Google has no ${method} ${path}` } }, 404);
  }) as typeof fetch;

  const byUserCode = (code: string) => [...devices.values()].find((d) => d.userCode === code);

  return {
    fetch: fetchImpl,
    calls,
    addClient(clientId: string, secret: string) {
      clients.set(clientId, secret);
    },
    /** The owner pressed Allow for this code, signed in as `email`. */
    approve(userCode: string, email: string) {
      const d = byUserCode(userCode);
      if (!d) throw new Error(`no sign-in with code ${userCode}`);
      d.state = 'allowed';
      d.email = email;
    },
    deny(userCode: string) {
      const d = byUserCode(userCode);
      if (d) d.state = 'denied';
    },
    /** Google ends every connection of this client (the consent screen left in "Testing", a deleted client). */
    revokeAll() {
      refresh.clear();
      access.clear();
    },
    /** A file or folder made by `clientId` for `email` (what the server's copy uploads). */
    add(email: string, clientId: string, file: { name: string; parentId?: string; folder?: boolean; size?: number; createdTime?: string; appProperties?: Record<string, string> }): string {
      const it: Item = {
        id: id('f-'),
        name: file.name,
        mimeType: file.folder ? FOLDER_MIME : 'application/octet-stream',
        parents: [file.parentId ?? 'root'],
        size: file.folder ? undefined : String(file.size ?? 0),
        createdTime: file.createdTime ?? new Date(Date.now() + ++n).toISOString(),
        appProperties: file.appProperties,
        trashed: false,
        owner: `${email}|${clientId}`,
      };
      items.set(it.id, it);
      return it.id;
    },
    trash(fileId: string) {
      const it = items.get(fileId);
      if (it) it.trashed = true;
    },
    items: () => [...items.values()],
  };
}

export type FakeGoogle = ReturnType<typeof createFakeGoogle>;
