// S29 · PR 753 — Reports › Geography map: the boundary shapes of one level (?level=division|district|upazila|area), read
// from the pack in the repo (PR 750; no network call). `reports.read`, and only while the map is on. The shapes are open
// data and the same for every store, so the browser may keep them for a day. The credit goes with them (CC BY 3.0 IGO).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { readGeoPack } from '@extas/delivery/geo';
import type { GeoPack } from '@extas/metrics/geo-types';
import { fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { PACK_OF } from './model';

const ONE_DAY = 86_400; // hardcode-ok: how long a browser may keep open-data shapes, not a business number

export async function geoMapShapesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const setting = await deps!.resolver.value('reports.geoMap', { storeId: MOTHER_STORE_ID });
  if (!setting.on) return json({ ok: false, error: 'not_on', message: 'The Geography map is not switched on.' }, { status: 404 });
  const level = new URL(request.url).searchParams.get('level') ?? '';
  const file = (PACK_OF as Record<string, GeoPack['level'] | undefined>)[level];
  if (!file) return json({ ok: false, error: 'bad_query', message: 'Unknown level.' }, { status: 400 });
  const pack = readGeoPack(file);
  const res = json({ ok: true, pack }, { status: 200 });
  res.headers.set('cache-control', `private, max-age=${ONE_DAY}`);
  return res;
}
