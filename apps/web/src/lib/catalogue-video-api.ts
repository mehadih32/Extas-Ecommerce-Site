// S28 · PR 681 — /api/admin/products/<id>/video: the product's video.
//   GET     the active video (`catalogue.read`) and whether the switch is on
//   PUT     {url, durationSec?, posterAssetId?, titleEn?, titleBn?}  a link (YouTube, Vimeo, Facebook)
//   POST    multipart: file (MP4, MOV or WebM), durationSec?  an uploaded clip, stored as it is
//   PATCH   {durationSec?, posterAssetId?, titleEn?, titleBn?}
//   DELETE  takes it off the product (archived)
// Everything needs `catalogue.write` except the GET; the catalogue service checks again.
import * as cat from '@extas/catalogue';
import { storeGeneratedFile, type MediaDeps } from '@extas/media';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './catalogue-api';

const TYPES: Record<string, { ext: string; mime: string }> = {
  'video/mp4': { ext: 'mp4', mime: 'video/mp4' },
  'video/quicktime': { ext: 'mov', mime: 'video/quicktime' },
  'video/webm': { ext: 'webm', mime: 'video/webm' },
};

export function productVideoHandler(request: Request, deps: AdminDeps | null, media: MediaDeps | null, id: string): Promise<Response> {
  const m = request.method.toUpperCase();
  if (!isUuid(id)) return Promise.resolve(fail(400, 'INVALID_INPUT', ['id']));
  if (m === 'GET') {
    return handle(request, deps, 'catalogue.read', async (c) => ({
      video: await cat.getProductVideo(c.deps, c.who, id),
      on: (await c.deps.settings.value('catalogue.video', { storeId: c.who.storeId })).on,
    }));
  }
  return handle(request, deps, 'catalogue.write', async (c) => {
    if (m === 'PUT') return { video: await cat.setLinkVideo(c.deps, c.who, id, await body(request)) };
    if (m === 'PATCH') return { video: await cat.updateProductVideo(c.deps, c.who, id, await body(request)) };
    if (m === 'DELETE') {
      await cat.removeProductVideo(c.deps, c.who, id);
      return { video: null };
    }
    if (m === 'POST') {
      if (!media) return fail(503, 'database-not-configured');
      const set = await c.deps.settings.value('catalogue.video', { storeId: c.who.storeId });
      if (!set.on) return fail(409, 'CONFLICT', ['VIDEO_OFF']);
      if (!set.allowUpload) return fail(409, 'CONFLICT', ['UPLOAD_OFF']);
      const max = set.maxUploadMb * 1024 * 1024;
      if (Number(request.headers.get('content-length') ?? '0') > max * 1.05 + 64 * 1024) return fail(413, 'TOO_LARGE', [`max:${max}`]);
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return fail(400, 'INVALID_INPUT', ['file']);
      }
      const file = form.get('file');
      if (!(file instanceof File)) return fail(400, 'INVALID_INPUT', ['file']);
      const type = TYPES[file.type];
      if (!type) return fail(400, 'TYPE_NOT_ALLOWED', [file.type || 'unknown']);
      if (file.size > max) return fail(413, 'TOO_LARGE', [`max:${max}`]);
      const dur = Number(form.get('durationSec'));
      const stored = await storeGeneratedFile(media, {
        storeId: c.who.storeId,
        kind: 'VIDEO',
        body: new Uint8Array(await file.arrayBuffer()),
        contentType: type.mime,
        name: `product video ${id.slice(0, 8)}`,
        extension: type.ext,
        folder: 'product-video',
        fileName: file.name || null,
        uploadedById: c.who.actor.staffUserId ?? null,
      });
      return { video: await cat.setFileVideo(c.deps, c.who, id, { assetId: stored.id, ...(Number.isInteger(dur) && dur > 0 ? { durationSec: dur } : {}) }) };
    }
    return fail(405, 'method-not-allowed');
  });
}
