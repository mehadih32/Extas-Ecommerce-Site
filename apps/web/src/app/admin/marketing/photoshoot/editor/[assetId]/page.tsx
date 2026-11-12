// S24 · PR 457 (Blueprint C7.8, C7.16 — "a small editor in the admin: crop, straighten, brightness and
// contrast, spot removal, and 'run finishing again'") — Marketing › Photoshoot editor at
// /admin/marketing/photoshoot/editor/[assetId]. Seeing it needs `photoshoot.read`; saving an edit needs
// `photoshoot.write` (the API re-checks). Hidden from the menu by `stages.closedShown.S24` until the whole
// stage is finished and gated (PR 652's mechanism, the same as PR 437's own Studio page) — but this address
// works once you have it.
// lib/marketing/photoshootEditor.ts. Guide: docs/admin-guide/pages/marketing/photoshoot-editor.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { EditOperation, EditOperationKind } from '@extas/photoshoot';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PhotoshootEditorForm } from '@/components/admin/marketing/PhotoshootEditorForm';
import { ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { loadEditorView } from '@/lib/marketing/photoshootEditor';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../../messages/admin-marketing-photoshoot-editor.bn.json';
import en from '../../../../../../../messages/admin-marketing-photoshoot-editor.en.json';
import '../../../../settings-cards.css';
import '../../../ad-platforms/ad-platforms.css';
import '../../photoshoot.css';

export const dynamic = 'force-dynamic';

const KEY = 'marketingPhotoshootEditor';
const here = (assetId: string) => `/admin/marketing/photoshoot/editor/${assetId}`;

type Params = Promise<{ assetId: string }>;

function withScreen<T extends { lang: 'bn' | 'en'; dict: Dict }>(view: T): T {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  void (await params);
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'photoshootEditor.metaTitle'), robots: { index: false, follow: false } };
}

export default async function PhotoshootEditorPage({ params }: { params: Params }) {
  const { assetId } = await params;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('photoshoot.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here(assetId))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="photoshoot-editor-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="photoshoot.read" />
      </div>
    );
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const o = await loadEditorView(access.deps, who, assetId);
  if (!o.asset)
    return (
      <div className="a2-z" data-testid="photoshoot-editor-page" data-lm-ready="">
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const canWrite = access.guard.permissions?.has('photoshoot.write') ?? false;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `photoshootEditor.${k}`, vars);
  const errKeys = ['INVALID_INPUT', 'SOURCE_INVALID', 'NOT_FOUND', 'forbidden', 'unauthorized', 'network', 'other'];
  const texts = {
    err: Object.fromEntries(errKeys.map((k) => [k, g(`form.err.${k}`)])),
    preview: g('form.preview'),
    noPicture: g('form.noPicture'),
    crop: g('form.crop'),
    cropX: g('form.cropX'),
    cropY: g('form.cropY'),
    cropWidth: g('form.cropWidth'),
    cropHeight: g('form.cropHeight'),
    straighten: g('form.straighten'),
    straightenHelp: g('form.straightenHelp'),
    tone: g('form.tone'),
    brightness: g('form.brightness'),
    contrast: g('form.contrast'),
    spots: g('form.spots'),
    spotX: g('form.spotX'),
    spotY: g('form.spotY'),
    spotAdd: g('form.spotAdd'),
    spotEmpty: g('form.spotEmpty'),
    spotRemove: g('form.spotRemove'),
    rerun: g('form.rerun'),
    rerunHint: g('form.rerunHint'),
    rerunNotGenerated: g('form.rerunNotGenerated'),
    save: g('form.save'),
    saving: g('form.saving'),
    saved: g('form.saved'),
    nothingToSave: g('form.nothingToSave'),
  };
  const kindLabel = (k: EditOperationKind) => g(`kinds.${k}`);
  const previewUrl = (() => {
    if (!o.image) return null;
    const jpegs = o.image.variants.filter((v) => v.format === 'jpeg');
    const pool = jpegs.length ? jpegs : o.image.variants;
    if (!pool.length) return null;
    return pool.reduce((a, b) => (b.width > a.width ? b : a)).url;
  })();

  return (
    <div className="a2-z" data-testid="photoshoot-editor-page" data-lm-ready="">
      <div className="a2-sc">
        <h1 className="a2-h3">{g('title')}</h1>
        <p className="a2-sm a2-mute">{g('sub')}</p>
      </div>

      {canWrite ? <PhotoshootEditorForm assetId={assetId} isAiGenerated={o.asset.isAiGenerated} previewUrl={previewUrl} texts={texts} /> : null}

      <section className="a2-sc a2-mt12" aria-labelledby="ped-hist-h" data-testid="ped-history">
        <h2 className="a2-h3" id="ped-hist-h">
          {g('history.h')}
        </h2>
        <p className="a2-sm a2-mute">{g('history.d')}</p>
        {o.edits.length ? (
          <ul className="adp-rules yt-mt8">
            {o.edits.map((e) => (
              <li key={e.id} className="adp-rule" data-testid="ped-history-row">
                <p className="a2-sm adp-sub">{e.operations.map((op: EditOperation) => kindLabel(op.kind)).join(' · ')}</p>
                <p className="a2-sm a2-mute">{new Date(e.createdAt).toLocaleString(view.locale)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{g('history.empty')}</p>
        )}
      </section>
    </div>
  );
}
