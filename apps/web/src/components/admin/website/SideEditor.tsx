'use client';
// S02 · PR 596 — Website › Side canvas (demo #/admin/side-canvas "দুই পাশের জায়গা"), in the Lumen look: the master switch
// (off as shipped; turning it on asks first: the owner's approval), its numbers, the zones (left or right; pages; days;
// place and standard size; fixed, sticky or floating; a product, a category, an image or a small offer button; on a card
// or straight on the page) with Edit and Duplicate (hidden, never deleted), and the approval map: the page at 1440 and
// 1920 px with every zone where it would sit (lib/shop/side-fit.ts, the shop's own rule), drawn from the draft, so the
// owner sees it before anything changes. Save sends everything (PUT /api/admin/website/side-canvas,
// `website.layout.write`; the API checks again).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { SideCanvas, SideZone } from '@extas/settings';
import { showToast } from '@/components/admin/lumen/Toast';
import { fitZone, zoneLive } from '@/lib/shop/side-fit';

const API = '/api/admin/website/side-canvas';
/** The shop's content column (.container's widest) and the map's page height, in px. */
// hardcode-ok: the shop stylesheet's content column (shop.css .container: 1240 px, 1504 px from a 1536 px window)
const contentAt = (w: number) => (w >= 1536 ? 1504 : 1240); // hardcode-ok: shop.css's container widths and their breakpoint
const MAP_H = 900; // hardcode-ok: the map's page height
const HEAD = 64; // hardcode-ok: the map's header band height
const MAP_WIDTHS = [1440, 1920]; // hardcode-ok: the demo's approval widths
const KINDS = ['product', 'category', 'image', 'teaser'] as const;
const MODES = ['fixed', 'sticky', 'float'] as const;

type Dict = { [k: string]: string | Dict };
export interface SideChoices {
  products: { slug: string; en: string; bn: string | null }[];
  cats: { slug: string; en: string; bn: string | null }[];
}

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => 'abcdefghijklmnopqrstuvwxyz0123456789'[n % 36]).join('');

export function SideEditor(p: { canvas: SideCanvas; zones: SideZone[]; version: string; canEdit: boolean; today: string; choices: SideChoices; lang: 'en' | 'bn'; w: Dict }) {
  const router = useRouter();
  const uid = useId();
  const g = (k: string): string => {
    const v = k.split('.').reduce<string | Dict | undefined>((o, part) => (o && typeof o === 'object' ? o[part] : undefined), p.w);
    return typeof v === 'string' ? v : k;
  };
  const [canvas, setCanvas] = useState(p.canvas);
  const [zones, setZones] = useState(p.zones);
  const [open, setOpen] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify([canvas, zones]) !== JSON.stringify([p.canvas, p.zones]);
  const nameOf = (x: { en: string; bn: string | null }) => (p.lang === 'bn' && x.bn) || x.en;
  const patch = (id: string, q: Partial<SideZone>) => setZones(zones.map((z) => (z.id === id ? { ...z, ...q } : z)));
  const add = (side: 'left' | 'right') => {
    const z: SideZone = { id: newId(), name: '', side, on: false, pages: 'both', cats: [], from: null, to: null, top: 48, width: 112, height: 320, mode: 'sticky', kind: 'product', ref: '', alt: { en: '', bn: '' }, text: { en: '', bn: '' }, href: '', style: 'full' };
    setZones([...zones, z]);
    setOpen(z.id);
  };
  const duplicate = (z: SideZone) => {
    const copy = { ...structuredClone(z), id: newId(), on: false, name: g('copyName').replace('{name}', z.name || g(`kind.${z.kind}`)).slice(0, 80) };
    setZones([...zones, copy]);
    showToast({ text: g('duplicated'), tone: 'info' });
  };
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(API, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ canvas, zones, version: p.version }) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string };
      if (data.ok) {
        showToast({ text: g('saved'), tone: 'ok' });
        setOpen(null);
        router.refresh();
      } else {
        const code = data.error ?? (res.status === 403 ? 'forbidden' : 'other');
        showToast({ text: g(`err.${code}`) === `err.${code}` ? g('err.other') : g(`err.${code}`), tone: 'bad' });
      }
    } catch {
      showToast({ text: g('err.network'), tone: 'bad' });
    }
    setBusy(false);
  };
  const num = (label: string, value: number, min: number, max: number, set: (n: number) => void, id: string) => (
    <div className="lm-fl" key={id}>
      <label htmlFor={`${uid}-${id}`}>{label}</label>
      <input id={`${uid}-${id}`} className="lm-inp" type="number" inputMode="numeric" min={min} max={max} value={value} disabled={!p.canEdit} onChange={(e) => set(Math.min(max, Math.max(min, Math.round(Number(e.target.value) || 0))))} />
    </div>
  );
  const words = (z: SideZone, k: 'text' | 'alt') => (
    <fieldset className="scx-words" key={k}>
      <legend>{g(`f.${k}`)}</legend>
      {(['en', 'bn'] as const).map((l) => (
        <div className="lm-fl" key={l}>
          <label htmlFor={`${uid}-${z.id}-${k}-${l}`}>{g(`f.${l}`)}</label>
          <input id={`${uid}-${z.id}-${k}-${l}`} className="lm-inp" lang={l} maxLength={120} value={z[k][l]} onChange={(e) => patch(z.id, { [k]: { ...z[k], [l]: e.target.value } })} />
        </div>
      ))}
    </fieldset>
  );
  const select = (label: string, value: string, opts: [string, string][], set: (v: string) => void, id: string) => {
    const all: [string, string][] = opts.some(([v]) => v === value) ? opts : [...opts, [value, value]];
    return (
      <div className="lm-fl" key={id}>
        <label htmlFor={`${uid}-${id}`}>{label}</label>
        <select id={`${uid}-${id}`} className="lm-inp" value={value} onChange={(e) => set(e.target.value)}>
          {all.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const form = (z: SideZone) => (
    <div className="lm-card scx-form lm-in" data-testid="sc-form" role="group" aria-label={g('formTitle')}>
      <h3 className="lm-h2">{g('formTitle')}</h3>
      <div className="scx-grid">
        <div className="lm-fl">
          <label htmlFor={`${uid}-${z.id}-name`}>{g('f.name')}</label>
          <input id={`${uid}-${z.id}-name`} className="lm-inp" maxLength={80} value={z.name} onChange={(e) => patch(z.id, { name: e.target.value })} data-testid="sc-f-name" />
        </div>
        {select(g('f.side'), z.side, [['left', g('side.left')], ['right', g('side.right')]], (v) => patch(z.id, { side: v as SideZone['side'] }), `${z.id}-side`)}
        {select(g('f.pages'), z.pages, (['both', 'home', 'categories'] as const).map((v) => [v, g(`pages.${v}`)]), (v) => patch(z.id, { pages: v as SideZone['pages'] }), `${z.id}-pages`)}
        <div className="lm-fl">
          <label htmlFor={`${uid}-${z.id}-from`}>{g('f.from')}</label>
          <input id={`${uid}-${z.id}-from`} className="lm-inp" type="date" value={z.from ?? ''} onChange={(e) => patch(z.id, { from: e.target.value || null })} />
        </div>
        <div className="lm-fl">
          <label htmlFor={`${uid}-${z.id}-to`}>{g('f.to')}</label>
          <input id={`${uid}-${z.id}-to`} className="lm-inp" type="date" value={z.to ?? ''} min={z.from ?? undefined} onChange={(e) => patch(z.id, { to: e.target.value || null })} />
        </div>
        {num(g('f.top'), z.top, 0, 2000, (n) => patch(z.id, { top: n }), `${z.id}-top`)}
        {num(g('f.width'), z.width, 40, 600, (n) => patch(z.id, { width: n }), `${z.id}-w`)}
        {num(g('f.height'), z.height, 40, 2000, (n) => patch(z.id, { height: n }), `${z.id}-h`)}
        {select(g('f.mode'), z.mode, MODES.map((m) => [m, g(`mode.${m}`)]), (v) => patch(z.id, { mode: v as SideZone['mode'] }), `${z.id}-mode`)}
        {select(g('f.kind'), z.kind, KINDS.map((k) => [k, g(`kind.${k}`)]), (v) => patch(z.id, { kind: v as SideZone['kind'], ref: '' }), `${z.id}-kind`)}
        {z.kind === 'product' ? select(g('f.product'), z.ref, [['', g('f.choose')], ...p.choices.products.map((x): [string, string] => [x.slug, nameOf(x)])], (v) => patch(z.id, { ref: v }), `${z.id}-ref`) : null}
        {z.kind === 'category' ? select(g('f.category'), z.ref, [['', g('f.choose')], ...p.choices.cats.map((x): [string, string] => [x.slug, nameOf(x)])], (v) => patch(z.id, { ref: v }), `${z.id}-ref`) : null}
        {z.kind === 'image' ? (
          <div className="lm-fl">
            <label htmlFor={`${uid}-${z.id}-img`}>{g('f.image')}</label>
            <input id={`${uid}-${z.id}-img`} className="lm-inp" inputMode="url" maxLength={300} value={z.ref} onChange={(e) => patch(z.id, { ref: e.target.value.trim() })} />
            <span className="lm-hint">{g('f.imageHint')}</span>
          </div>
        ) : null}
        {select(g('f.style'), z.style, [['full', g('style.full')], ['card', g('style.card')]], (v) => patch(z.id, { style: v as SideZone['style'] }), `${z.id}-style`)}
        <div className="lm-fl">
          <label htmlFor={`${uid}-${z.id}-href`}>{g('f.href')}</label>
          <input id={`${uid}-${z.id}-href`} className="lm-inp" inputMode="url" maxLength={300} value={z.href} onChange={(e) => patch(z.id, { href: e.target.value.trim() })} />
          <span className="lm-hint">{g('f.hrefHint')}</span>
        </div>
        {words(z, 'text')}
        {z.kind !== 'teaser' ? words(z, 'alt') : null}
      </div>
      {z.pages !== 'home' ? (
        <fieldset className="scx-words">
          <legend>{g('f.cats')}</legend>
          <span className="lm-hint">{g('f.catsHint')}</span>
          <div className="scx-cats">
            {p.choices.cats.map((c) => (
              <label key={c.slug} className="scx-cat">
                <input type="checkbox" checked={z.cats.includes(c.slug)} onChange={(e) => patch(z.id, { cats: e.target.checked ? [...z.cats, c.slug] : z.cats.filter((x) => x !== c.slug) })} />
                <span>{nameOf(c)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <p className="lm-hint">{g('f.weightNote')}</p>
      <div className="scx-bar">
        <button type="button" className="lm-btn pri" onClick={() => setOpen(null)} data-testid="sc-f-done">
          {g('f.done')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="scx" data-testid="sc-editor">
      <section className="lm-setc" aria-labelledby={`${uid}-m`} data-testid="sc-master">
        <div className="lm-setr">
          <div>
            <h3 id={`${uid}-m`}>{g('master.title')}</h3>
            <p>{canvas.enabled ? g('master.on') : g('master.off')}</p>
          </div>
          <button type="button" role="switch" aria-checked={canvas.enabled} aria-labelledby={`${uid}-m`} className={`lm-sw${canvas.enabled ? ' on' : ''}`} disabled={!p.canEdit} onClick={() => (canvas.enabled ? setCanvas({ ...canvas, enabled: false }) : setAsk(true))} data-testid="sc-master-sw">
            <span aria-hidden="true" />
          </button>
        </div>
        {ask ? (
          <div className="lm-ask" role="alertdialog" aria-labelledby={`${uid}-q`}>
            <p id={`${uid}-q`}>{g('master.ask')}</p>
            <div>
              <button type="button" className="lm-btn sm gh" onClick={() => setAsk(false)}>
                {g('master.no')}
              </button>
              <button type="button" className="lm-btn sm pri" onClick={() => (setCanvas({ ...canvas, enabled: true }), setAsk(false))} data-testid="sc-master-yes">
                {g('master.yes')}
              </button>
            </div>
          </div>
        ) : null}
        <div className="lm-fold">
          {num(g('master.gap'), canvas.gap, 0, 200, (n) => setCanvas({ ...canvas, gap: n }), 'gap')}
          {num(g('master.float'), canvas.float, 0, 200, (n) => setCanvas({ ...canvas, float: n }), 'float')}
          {num(g('master.minWidth'), canvas.minWidth, 1024, 4000, (n) => setCanvas({ ...canvas, minWidth: n }), 'minw')}
        </div>
      </section>

      <section className="lm-card scx-card" aria-labelledby={`${uid}-z`}>
        <h2 id={`${uid}-z`}>{g('zones.title')}</h2>
        <p className="lm-sub">{g('zones.sub')}</p>
        {zones.length ? null : <p className="lm-hint">{g('zones.none')}</p>}
        <ul className="scx-list">
          {zones.map((z) => {
            const st = !z.on ? 'off' : zoneLive(z, p.today) ? 'live' : z.from && p.today < z.from ? 'soon' : 'ended';
            return (
              <li key={z.id} className="scx-li">
                <div className={`scx-row${z.on ? '' : ' off'}`} data-testid="sc-row" data-id={z.id}>
                  <div className="scx-name">
                    <b>{z.name || g(`kind.${z.kind}`)}</b>
                    <span className="lm-hint">
                      <span className={`scx-tag st-${st}`}>{g(`state.${st}`)}</span> {g(`side.${z.side}`)} · {g(`pages.${z.pages}`)} · {z.width}×{z.height} px · {g(`mode.${z.mode}`)}
                    </span>
                  </div>
                  <div className="scx-acts">
                    <button type="button" role="switch" aria-checked={z.on} aria-label={`${g('show')}: ${z.name || g(`kind.${z.kind}`)}`} className={`lm-sw${z.on ? ' on' : ''}`} disabled={!p.canEdit} onClick={() => patch(z.id, { on: !z.on })} data-testid={`sc-on-${z.id}`}>
                      <span aria-hidden="true" />
                    </button>
                    {p.canEdit ? (
                      <>
                        <button type="button" className="lm-btn sm" aria-expanded={open === z.id} onClick={() => setOpen(open === z.id ? null : z.id)} data-testid={`sc-edit-${z.id}`}>
                          {g('edit')}
                        </button>
                        <button type="button" className="lm-btn sm gh" onClick={() => duplicate(z)}>
                          {g('duplicate')}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                {open === z.id ? form(z) : null}
              </li>
            );
          })}
        </ul>
        {p.canEdit ? (
          <div className="scx-bar">
            <button type="button" className="lm-btn" onClick={() => add('left')} data-testid="sc-add-left">
              {g('addLeft')}
            </button>
            <button type="button" className="lm-btn" onClick={() => add('right')} data-testid="sc-add-right">
              {g('addRight')}
            </button>
          </div>
        ) : null}
        <p className="lm-hint">{g('hideNote')}</p>
      </section>

      <section className="lm-card scx-card" aria-labelledby={`${uid}-a`} data-testid="sc-map">
        <h2 id={`${uid}-a`}>{g('map.title')}</h2>
        <p className="lm-sub">{canvas.enabled ? g('map.subOn') : g('map.subOff')}</p>
        <div className="scx-maps">
          {MAP_WIDTHS.map((W) => {
            const CONTENT = contentAt(W);
            const side = (W - CONTENT) / 2;
            const shown = zones.filter((z) => z.on);
            const out = shown.filter((z) => !fitZone(z, W, CONTENT, canvas.gap, canvas.minWidth).show);
            return (
              <figure key={W} className="scx-fig">
                <figcaption className="lm-hint">{g('map.at').replace('{w}', String(W)).replace('{g}', String(Math.round(side)))}</figcaption>
                <div className="scx-pg" style={{ aspectRatio: `${W} / ${MAP_H}` }}>
                  <div className="scx-head" style={{ height: `${(HEAD / MAP_H) * 100}%` }} />
                  <div className="scx-content" style={{ left: `${(side / W) * 100}%`, width: `${(CONTENT / W) * 100}%`, top: `${(HEAD / MAP_H) * 100}%` }} />
                  {shown.map((z) => {
                    const f = fitZone(z, W, CONTENT, canvas.gap, canvas.minWidth);
                    if (!f.show) return null;
                    return (
                      <div key={z.id} className={`scx-zone k-${z.kind}`} title={z.name || g(`kind.${z.kind}`)} style={{ left: `${(f.x / W) * 100}%`, top: `${((HEAD + z.top) / MAP_H) * 100}%`, width: `${(f.width / W) * 100}%`, height: `${(Math.min(f.height, MAP_H - HEAD - z.top) / MAP_H) * 100}%` }}>
                        <span>{z.name || g(`kind.${z.kind}`)}</span>
                      </div>
                    );
                  })}
                </div>
                {out.length ? <p className="lm-hint scx-out">{g('map.out').replace('{names}', out.map((z) => z.name || g(`kind.${z.kind}`)).join(', '))}</p> : null}
              </figure>
            );
          })}
        </div>
        <p className="lm-hint">{g('map.note')}</p>
      </section>

      {p.canEdit ? (
        <div className="scx-save">
          {dirty ? (
            <p className="lm-hint" role="status">
              {g('unsaved')}
            </p>
          ) : null}
          <div className="scx-bar">
            <button type="button" className="lm-btn pri" disabled={busy || !dirty} onClick={() => void save()} data-testid="sc-save">
              {busy ? g('saving') : g('save')}
            </button>
            {dirty ? (
              <button type="button" className="lm-btn" disabled={busy} onClick={() => (setCanvas(p.canvas), setZones(p.zones), setOpen(null))}>
                {g('discard')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
