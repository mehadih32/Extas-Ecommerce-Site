'use client';
// PR 726 — Website › Brand & menus: the cards (Brand, Header & menu, Footer; PR 745 adds Contact & sharing) with a live preview each. Every list
// is rearranged by grabbing its handle (mouse, touch) or with the arrow keys and the Move up / Move down buttons
// (components/admin/website/Sortable); a box shows or hides a row (nothing is deleted: only the owner's own new rows
// can be taken off the list, and Discard brings them back until the card is saved); words are an English + Bengali
// pair. Each card is saved whole with its version to /api/admin/website/brand (STALE: the card is read again).
// Words come from the page (messages/admin-brand.<lang>.json), never from here.
import { useId, useState, type ReactNode } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { useShellText } from '../shell/ShellText';
import { commonSaveError } from '@/lib/admin-shell/save-errors';
import {
  dropInto,
  moveBy,
  moveLink,
  newId,
  type BrandCardValue,
  type CardKey,
  type CardValue,
  type ContactCardValue,
  type FooterCardValue,
  type FooterColumnRow,
  type FooterLinkRow,
  type LinkScreen,
  type MenuCardValue,
  type Pair,
} from '@/lib/admin-brand/model';
import { useDragging, type DragFrom, type DragTo } from './Sortable';

const API = '/api/admin/website/brand';
const MEDIA_API = '/api/admin/media';

export interface BrandScreen<K extends CardKey> {
  key: K;
  value: CardValue[K];
  version: string;
}
export interface BrandPreviews {
  logo: string | null;
  logoPhone: string | null;
  favicon: string | null;
  ogImage: string | null;
}
export interface BrandEditorProps {
  brand: BrandScreen<'brand'>;
  contact: BrandScreen<'contact'>;
  /** The little pictures a footer link may wear (the shop's own list). */
  icons: string[];
  menu: BrandScreen<'menu'>;
  footer: BrandScreen<'footer'>;
  previews: BrandPreviews;
  /** The words of the page, flat: `brand.name`, `err.STALE` … */
  texts: Record<string, string>;
  /** The admin's language, for the previews. */
  lang: 'en' | 'bn';
  canEdit: boolean;
  seoHref: string;
  styleCount: number;
  /** The shop's own words at a few dictionary keys (social, payment marks), per language. */
  marks: Record<string, Pair>;
}

type Say = { text: string; bad: boolean } | null;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const pick = (p: Pair | null, lang: 'en' | 'bn') => (p ? p[lang].trim() || p.en.trim() : '');
const blank: Pair = { en: '', bn: '' };

/** One card's draft, its version and its save (the same rules as every settings card: STALE reads it again). */
function useCard<K extends CardKey>(screen: BrandScreen<K>, x: (k: string) => string, canEdit: boolean, onSaved: (p: BrandPreviews) => void, check?: (v: CardValue[K]) => string | null) {
  const shell = useShellText();
  const [base, setBase] = useState(screen);
  const [draft, setDraft] = useState<CardValue[K]>(screen.value);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Say>(null);
  const dirty = !same(draft, base.value);
  const edit = (next: CardValue[K]) => {
    setDraft(next);
    setSaid(null);
  };
  const fresh = (cards: Record<string, BrandScreen<K>> | undefined) => {
    const c = cards?.[base.key];
    if (!c) return;
    setBase(c);
    setDraft(c.value);
  };
  async function save() {
    const problem = check?.(draft) ?? null;
    if (problem) return setSaid({ text: problem, bad: true });
    setBusy(true);
    const a = await call('PUT', API, { key: base.key, value: draft, version: base.version });
    setBusy(false);
    if (a.status === 200) {
      fresh(a.data.cards as Record<string, BrandScreen<K>>);
      if (a.data.previews) onSaved(a.data.previews as BrandPreviews);
      setSaid(null);
      return showToast({ text: x('saved'), tone: 'ok' });
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') {
      const g = await call('GET', API);
      if (g.status === 200) {
        fresh(g.data.cards as Record<string, BrandScreen<K>>);
        if (g.data.previews) onSaved(g.data.previews as BrandPreviews);
      }
    }
    const text = x(`err.${code}`);
    setSaid({ text: text !== `err.${code}` ? text : (commonSaveError(shell.dict, code) ?? x('err.other')), bad: true });
  }
  return { base, draft, edit, busy, said, dirty, off: !canEdit || busy, save, discard: () => edit(base.value) };
}

function Frame(props: { id: string; title: string; sub: string; testId: string; canEdit: boolean; readOnly: string; card: { busy: boolean; dirty: boolean; said: Say; save: () => void; discard: () => void }; x: (k: string) => string; children: ReactNode }) {
  const { card: c, x } = props;
  return (
    <section className="a2-sc a2-mt12 bm-card" aria-labelledby={`${props.id}-h`} data-testid={props.testId}>
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${props.id}-h`}>
            {props.title}
          </h2>
          <p className="a2-scd">{props.sub}</p>
        </div>
      </div>
      {!props.canEdit ? (
        <div className="a2-note" role="note">
          <span>{props.readOnly}</span>
        </div>
      ) : null}
      {props.children}
      <div className="a2-scbar">
        <span className={`a2-sm${c.said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid={`${props.testId}-status`}>
          {c.said ? c.said.text : c.dirty ? x('unsaved') : ''}
        </span>
        {props.canEdit ? (
          <div className="a2-gap8">
            {c.dirty ? (
              <button type="button" className="a2-btn bm-btn" disabled={c.busy} onClick={c.discard} data-testid={`${props.testId}-discard`}>
                {x('discard')}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri bm-btn" disabled={c.busy || !c.dirty} onClick={c.save} data-testid={`${props.testId}-save`}>
              {c.busy ? x('saving') : x('save')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PairInputs(props: { label: string; value: Pair | null; max: number; disabled: boolean; onChange: (p: Pair | null) => void; testId: string; help?: string; x: (k: string) => string }) {
  const id = useId();
  const v = props.value ?? blank;
  const set = (lang: 'en' | 'bn', text: string) => {
    const next = { ...v, [lang]: text };
    props.onChange(next.en || next.bn ? next : null);
  };
  return (
    <div className="a2-fld">
      <span className="a2-lbl">{props.label}</span>
      <div className="bm-pair">
        <input id={`${id}-en`} className="a2-inp" aria-label={`${props.label} (${props.x('lang.en')})`} placeholder={props.x('lang.en')} maxLength={props.max} value={v.en} disabled={props.disabled} onChange={(e) => set('en', e.target.value)} data-testid={`${props.testId}-en`} />
        <input id={`${id}-bn`} className="a2-inp" lang="bn" aria-label={`${props.label} (${props.x('lang.bn')})`} placeholder={props.x('lang.bn')} maxLength={props.max} value={v.bn} disabled={props.disabled} onChange={(e) => set('bn', e.target.value)} data-testid={`${props.testId}-bn`} />
      </div>
      {props.help ? <span className="a2-xs a2-mute">{props.help}</span> : null}
    </div>
  );
}

/** A box that shows or hides: a labelled checkbox, a 44 px target. */
function Show(props: { on: boolean; label: string; disabled: boolean; onChange: (on: boolean) => void; testId: string }) {
  return (
    <label className="bm-tgl">
      <input type="checkbox" className="a2-chk" checked={props.on} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} data-testid={props.testId} />
      <span>{props.label}</span>
    </label>
  );
}

interface RowProps {
  kind: string;
  list: string;
  id: string;
  index: number;
  count: number;
  drag: ReturnType<typeof useDragging>;
  nudge: (delta: -1 | 1) => void;
  disabled: boolean;
  x: (k: string) => string;
  /** The row's own name, for the handle's spoken label. */
  name: string;
  children: ReactNode;
  actions?: ReactNode;
  testId: string;
}

function Row(p: RowProps) {
  const over = p.drag.over && p.drag.over.list === p.list && p.drag.over.before === p.id && p.drag.from?.kind === p.kind;
  const mine = p.drag.from?.id === p.id && p.drag.from.kind === p.kind;
  return (
    <li className="bm-row" data-sl-id={p.id} data-sl-kind={p.kind} data-over={over ? 'before' : undefined} data-dragging={mine ? 'true' : undefined} data-testid={p.testId}>
      <button type="button" className="bm-grip" disabled={p.disabled} aria-label={`${p.x('drag')}: ${p.name}`} title={p.x('dragHelp')} {...p.drag.grip(p.kind, p.list, p.id)} data-testid={`${p.testId}-grip`}>
        <span aria-hidden="true">⠿</span>
      </button>
      <div className="bm-body">{p.children}</div>
      <div className="bm-acts">
        {p.actions}
        <button type="button" className="a2-btn bm-ic" disabled={p.disabled || p.index === 0} aria-label={`${p.x('up')}: ${p.name}`} onClick={() => p.nudge(-1)} data-testid={`${p.testId}-up`}>
          <span aria-hidden="true">↑</span>
        </button>
        <button type="button" className="a2-btn bm-ic" disabled={p.disabled || p.index >= p.count - 1} aria-label={`${p.x('down')}: ${p.name}`} onClick={() => p.nudge(1)} data-testid={`${p.testId}-down`}>
          <span aria-hidden="true">↓</span>
        </button>
      </div>
    </li>
  );
}

function List(props: { kind: string; list: string; drag: ReturnType<typeof useDragging>; empty: string; label: string; children: ReactNode; isEmpty: boolean; testId: string }) {
  const end = props.drag.over && props.drag.over.list === props.list && props.drag.over.before === null && props.drag.from?.kind === props.kind;
  return (
    <ul className="bm-list" data-sl-list={props.list} data-sl-kind={props.kind} data-end={end ? 'true' : undefined} aria-label={props.label} data-testid={props.testId}>
      {props.isEmpty ? <li className="bm-empty a2-xs a2-mute">{props.empty}</li> : null}
      {props.children}
    </ul>
  );
}

/** Rows of one list put in the order a drop or an arrow asks for. */
function place<T extends { id: string }>(list: T[], id: string, before: string | null): T[] {
  const row = list.find((r) => r.id === id);
  return row ? dropInto(list, row, before) : list;
}
function nudgeIn<T extends { id: string }>(list: T[], id: string, delta: -1 | 1): T[] {
  return moveBy(
    list,
    list.findIndex((r) => r.id === id),
    delta,
  );
}
const patch = <T extends { id: string }>(list: T[], id: string, change: Partial<T>): T[] => list.map((r) => (r.id === id ? { ...r, ...change } : r));

// ---- Brand ----

function LogoPicker(props: { id: string; label: string; help: string; value: string | null; savedId: string | null; serverUrl: string | null; disabled: boolean; x: (k: string) => string; onChange: (id: string | null) => void; testId: string }) {
  const [local, setLocal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const url = local ?? (props.value && props.value === props.savedId ? props.serverUrl : null);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'brand');
      const res = await fetch(MEDIA_API, { method: 'POST', body: form, credentials: 'same-origin' });
      const a = (await res.json().catch(() => ({ ok: false, error: 'server-error' }))) as { ok?: boolean; error?: string; asset?: { id: string } };
      if (a.ok && a.asset) {
        setLocal(URL.createObjectURL(file));
        props.onChange(a.asset.id);
      } else {
        const code = a.error ?? (res.status === 403 ? 'forbidden' : 'other');
        const text = props.x(`upload.${code}`);
        setErr(text !== `upload.${code}` ? text : props.x('upload.other'));
      }
    } catch {
      setErr(props.x('upload.network'));
    }
    setBusy(false);
  }
  return (
    <div className="a2-fld bm-logo" data-testid={props.testId}>
      <span className="a2-lbl">{props.label}</span>
      <div className="bm-logo-box">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- an admin preview of the owner's own picture
          <img src={url} alt="" className="bm-logo-img" />
        ) : (
          <span className="a2-xs a2-mute">{props.value ? props.x('logo.processing') : props.x('logo.none')}</span>
        )}
      </div>
      {!props.disabled ? (
        <div className="a2-gap8 bm-wrap">
          <label className={`a2-btn bm-btn${busy ? ' is-busy' : ''}`}>
            <input type="file" accept="image/*" className="bm-file" disabled={busy} onChange={(e) => void upload(e.target.files?.[0]).finally(() => (e.target.value = ''))} data-testid={`${props.testId}-file`} />
            {busy ? props.x('logo.uploading') : props.value ? props.x('logo.replace') : props.x('logo.upload')}
          </label>
          {props.value ? (
            <button
              type="button"
              className="a2-btn bm-btn"
              onClick={() => {
                setLocal(null);
                props.onChange(null);
              }}
              data-testid={`${props.testId}-clear`}
            >
              {props.x('logo.remove')}
            </button>
          ) : null}
        </div>
      ) : null}
      <span className="a2-xs a2-mute">{props.help}</span>
      {err ? (
        <span className="a2-xs bm-bad" role="alert">
          {err}
        </span>
      ) : null}
    </div>
  );
}

function BrandPreview(props: { v: BrandCardValue; lang: 'en' | 'bn'; urls: { logo: string | null; logoPhone: string | null; favicon: string | null }; x: (k: string) => string }) {
  const { v, lang, urls, x } = props;
  const name = v.name.trim() || x('preview.shopName');
  const slogan = pick(v.sloganShort ?? v.slogan, lang);
  const mark = (url: string | null, h: number) =>
    url ? (
      // eslint-disable-next-line @next/next/no-img-element -- an admin preview of the owner's own picture
      <img src={url} alt={name} style={{ height: h, width: 'auto', maxWidth: '100%' }} />
    ) : (
      <span className="bm-word" style={{ fontSize: Math.round(h * 0.7) }}>
        {name}
      </span>
    );
  return (
    <div className="bm-prev" data-testid="bm-brand-preview" aria-label={x('preview.label')}>
      <div className="bm-prev-tab" data-testid="bm-brand-tab">
        {urls.favicon ? (
          // eslint-disable-next-line @next/next/no-img-element -- an admin preview of the owner's own picture
          <img src={urls.favicon} alt="" width={16} height={16} />
        ) : (
          <span className="bm-fav" aria-hidden="true" />
        )}
        <span className="bm-tab-t">{(pick(v.tabTitle, lang) || name).replace('{shop}', name)}</span>
      </div>
      <div className="bm-prev-grid">
        <div className="bm-dev bm-dev-desk" data-testid="bm-brand-desk">
          <span className="a2-xs a2-mute">{x('preview.desktop')}</span>
          <div className="bm-hdr">
            {mark(urls.logo, v.logoSize.desk)}
            {slogan ? <span className="a2-xs a2-mute">{slogan}</span> : null}
          </div>
        </div>
        <div className="bm-dev bm-dev-phone" data-testid="bm-brand-phone">
          <span className="a2-xs a2-mute">{x('preview.phone')}</span>
          <div className="bm-hdr">{mark(urls.logoPhone ?? urls.logo, v.logoSize.phone)}</div>
        </div>
      </div>
    </div>
  );
}

function BrandCard(props: BrandEditorProps & { previews: BrandPreviews; onSaved: (p: BrandPreviews) => void; x: (k: string) => string }) {
  const { x } = props;
  const id = useId();
  const card = useCard(props.brand, x, props.canEdit, props.onSaved);
  const v = card.draft;
  const set = (change: Partial<BrandCardValue>) => card.edit({ ...v, ...change });
  const size = (k: 'desk' | 'phone' | 'footer', min: number, max: number, label: string) => (
    <div className="a2-fld" key={k}>
      <label className="a2-lbl" htmlFor={`${id}-${k}`}>
        {label}
      </label>
      <input id={`${id}-${k}`} className="a2-inp" type="number" inputMode="numeric" min={min} max={max} value={String(v.logoSize[k])} disabled={card.off} onChange={(e) => set({ logoSize: { ...v.logoSize, [k]: e.target.value === '' ? 0 : Number(e.target.value) } })} data-testid={`bm-brand-size-${k}`} />
      <span className="a2-xs a2-mute">{x('brand.sizeRange').replace('{min}', String(min)).replace('{max}', String(max))}</span>
    </div>
  );
  const saved = card.base.value;
  return (
    <Frame id={id} title={x('brand.h')} sub={x('brand.d')} testId="bm-brand" canEdit={props.canEdit} readOnly={x('readOnly')} card={card} x={x}>
      <div className="bm-split">
        <div className="a2-fg">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-name`}>
              {x('brand.name')}
            </label>
            <input id={`${id}-name`} className="a2-inp" maxLength={120} value={v.name} disabled={card.off} onChange={(e) => set({ name: e.target.value })} data-testid="bm-brand-name" />
            <span className="a2-xs a2-mute">{x('brand.nameHelp')}</span>
          </div>
          <PairInputs label={x('brand.slogan')} value={v.slogan} max={120} disabled={card.off} onChange={(p) => set({ slogan: p })} testId="bm-brand-slogan" help={x('brand.sloganHelp')} x={x} />
          <PairInputs label={x('brand.sloganShort')} value={v.sloganShort} max={60} disabled={card.off} onChange={(p) => set({ sloganShort: p })} testId="bm-brand-slogan-short" help={x('brand.sloganShortHelp')} x={x} />
          <PairInputs label={x('brand.tabTitle')} value={v.tabTitle} max={300} disabled={card.off} onChange={(p) => set({ tabTitle: p ?? blank })} testId="bm-brand-tab-title" help={x('brand.tabTitleHelp')} x={x} />
          <p className="a2-xs full">
            <a className="bm-seo-link" href={props.seoHref} data-testid="bm-brand-seo-link">
              {x('brand.seoLink')}
            </a>
          </p>
          <LogoPicker id={id} label={x('brand.logo')} help={x('brand.logoHelp')} value={v.logo} savedId={saved.logo} serverUrl={props.previews.logo} disabled={card.off} x={x} onChange={(logo) => set({ logo })} testId="bm-brand-logo" />
          <LogoPicker id={id} label={x('brand.logoPhone')} help={x('brand.logoPhoneHelp')} value={v.logoPhone} savedId={saved.logoPhone} serverUrl={props.previews.logoPhone} disabled={card.off} x={x} onChange={(logoPhone) => set({ logoPhone })} testId="bm-brand-logo-phone" />
          <LogoPicker id={id} label={x('brand.favicon')} help={x('brand.faviconHelp')} value={v.favicon} savedId={saved.favicon} serverUrl={props.previews.favicon} disabled={card.off} x={x} onChange={(favicon) => set({ favicon })} testId="bm-brand-favicon" />
          {size('desk', 16, 60, x('brand.sizeDesk'))}
          {size('phone', 16, 44, x('brand.sizePhone'))}
          {size('footer', 16, 60, x('brand.sizeFooter'))}
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-style`}>
              {x('brand.style')}
            </label>
            <select id={`${id}-style`} className="a2-sel" value={String(v.logoStyle)} disabled={card.off} onChange={(e) => set({ logoStyle: Number(e.target.value) })} data-testid="bm-brand-style">
              {Array.from({ length: props.styleCount }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? x('brand.style0') : x('brand.styleN').replace('{n}', String(i))}
                </option>
              ))}
            </select>
            <span className="a2-xs a2-mute">{x('brand.styleHelp')}</span>
          </div>
        </div>
        <BrandPreview v={v} lang={props.lang} urls={props.previews} x={x} />
      </div>
    </Frame>
  );
}

// ---- Contact & sharing (PR 745) ----

function ContactCard(props: BrandEditorProps & { previews: BrandPreviews; onSaved: (p: BrandPreviews) => void; x: (k: string) => string }) {
  const { x, lang } = props;
  const id = useId();
  const card = useCard(props.contact, x, props.canEdit, props.onSaved);
  const v = card.draft;
  const set = (change: Partial<ContactCardValue>) => card.edit({ ...v, ...change });
  const field = (k: 'phone' | 'whatsapp' | 'email', type: string, mode: 'tel' | 'email') => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`${id}-${k}`}>
        {x(`contact.${k}`)}
      </label>
      <input id={`${id}-${k}`} className="a2-inp" type={type} inputMode={mode} maxLength={254} value={v[k]} disabled={card.off} onChange={(e) => set({ [k]: e.target.value } as Partial<ContactCardValue>)} data-testid={`bm-contact-${k}`} />
      <span className="a2-xs a2-mute">{x(`contact.${k}Help`)}</span>
    </div>
  );
  return (
    <Frame id={id} title={x('contact.h')} sub={x('contact.d')} testId="bm-contact" canEdit={props.canEdit} readOnly={x('readOnly')} card={card} x={x}>
      <div className="bm-split">
        <div className="a2-fg">
          {field('phone', 'tel', 'tel')}
          {field('whatsapp', 'tel', 'tel')}
          {field('email', 'email', 'email')}
          <PairInputs label={x('contact.address')} value={v.address} max={500} disabled={card.off} onChange={(address) => set({ address })} testId="bm-contact-address" help={x('contact.addressHelp')} x={x} />
          <PairInputs label={x('contact.hours')} value={v.hours} max={120} disabled={card.off} onChange={(hours) => set({ hours })} testId="bm-contact-hours" help={x('contact.hoursHelp')} x={x} />
          <LogoPicker id={id} label={x('contact.og')} help={x('contact.ogHelp')} value={v.ogImage} savedId={card.base.value.ogImage} serverUrl={props.previews.ogImage} disabled={card.off} x={x} onChange={(ogImage) => set({ ogImage })} testId="bm-contact-og" />
        </div>
        <div className="bm-prev" data-testid="bm-contact-preview" aria-label={x('preview.label')}>
          <span className="a2-xs a2-mute">{x('contact.shareLook')}</span>
          <div className="bm-share">
            {props.previews.ogImage && v.ogImage === card.base.value.ogImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- an admin preview of the owner's own picture
              <img src={props.previews.ogImage} alt="" className="bm-share-img" />
            ) : (
              <span className="a2-xs a2-mute bm-share-none">{v.ogImage ? x('logo.processing') : x('contact.shareNone')}</span>
            )}
            <span className="bm-share-t">{props.brand.value.name.trim() || x('preview.shopName')}</span>
          </div>
          <div className="a2-xs" data-testid="bm-contact-lines">
            {[v.phone, v.whatsapp, v.email, pick(v.address, lang), pick(v.hours, lang)].filter(Boolean).map((t, i) => (
              <div key={i}>{t}</div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ---- Header & menu ----

function MenuCard(props: BrandEditorProps & { x: (k: string) => string; onSaved: (p: BrandPreviews) => void }) {
  const { x, lang } = props;
  const id = useId();
  const check = (v: MenuCardValue) => {
    const bad = v.items.some((i) => !i.builtIn && (!i.label || !i.label.en.trim() || !i.label.bn.trim() || !i.href.trim())) || v.announce.some((m) => !m.builtIn && (!m.text.en.trim() || !m.text.bn.trim()));
    return bad ? x('fillNew') : null;
  };
  const card = useCard(props.menu, x, props.canEdit, props.onSaved, check);
  const v = card.draft;
  const set = (change: Partial<MenuCardValue>) => card.edit({ ...v, ...change });
  const ids = [...v.items.map((i) => i.id), ...v.announce.map((m) => m.id)];
  const drag = useDragging({
    disabled: card.off,
    onDrop: (f: DragFrom, t: DragTo) => {
      if (f.kind === 'items') set({ items: place(v.items, f.id, t.before) });
      else if (f.kind === 'announce') set({ announce: place(v.announce, f.id, t.before) });
      else if (f.kind === 'icons') set({ icons: place(v.icons, f.id, t.before) });
    },
    onNudge: (f, d) => {
      if (f.kind === 'items') set({ items: nudgeIn(v.items, f.id, d) });
      else if (f.kind === 'announce') set({ announce: nudgeIn(v.announce, f.id, d) });
      else if (f.kind === 'icons') set({ icons: nudgeIn(v.icons, f.id, d) });
    },
  });
  const nm = (p: Pair | null, fb: string) => pick(p, lang) || fb;
  return (
    <Frame id={id} title={x('menu.h')} sub={x('menu.d')} testId="bm-menu" canEdit={props.canEdit} readOnly={x('readOnly')} card={card} x={x}>
      <div className="bm-split">
        <div className="bm-stack">
          <h3 className="a2-h4">{x('menu.announce')}</h3>
          <Show on={v.announceOn} label={x('menu.announceOn')} disabled={card.off} onChange={(announceOn) => set({ announceOn })} testId="bm-menu-announce-on" />
          <List kind="announce" list="announce" drag={drag} empty={x('menu.announceEmpty')} label={x('menu.announce')} isEmpty={!v.announce.length} testId="bm-menu-announce">
            {v.announce.map((m, i) => (
              <Row key={m.id} kind="announce" list="announce" id={m.id} index={i} count={v.announce.length} drag={drag} nudge={(d) => set({ announce: nudgeIn(v.announce, m.id, d) })} disabled={card.off} x={x} name={nm(m.text, m.id)} testId={`bm-menu-announce-${m.id}`}
                actions={
                  !m.builtIn ? (
                    <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ announce: v.announce.filter((r) => r.id !== m.id) })} data-testid={`bm-menu-announce-${m.id}-remove`}>
                      {x('remove')}
                    </button>
                  ) : null
                }
              >
                <PairInputs label={x('menu.announceText')} value={m.text} max={160} disabled={card.off} onChange={(p) => set({ announce: patch(v.announce, m.id, { text: p ?? blank }) })} testId={`bm-menu-announce-${m.id}-text`} x={x} />
                <div className="a2-fld">
                  <label className="a2-lbl" htmlFor={`${id}-a-${m.id}`}>
                    {x('menu.link')}
                  </label>
                  <input id={`${id}-a-${m.id}`} className="a2-inp" placeholder="/help/delivery" maxLength={300} value={m.href} disabled={card.off} onChange={(e) => set({ announce: patch(v.announce, m.id, { href: e.target.value }) })} data-testid={`bm-menu-announce-${m.id}-href`} />
                </div>
                <Show on={m.on} label={x('show')} disabled={card.off} onChange={(on) => set({ announce: patch(v.announce, m.id, { on }) })} testId={`bm-menu-announce-${m.id}-on`} />
              </Row>
            ))}
          </List>
          {v.announce.length < 10 && props.canEdit ? (
            <span>
              <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ announce: [...v.announce, { id: newId('note', ids, v.announce.length + 1), text: { ...blank }, href: '', on: true, builtIn: false }] })} data-testid="bm-menu-announce-add">
                {x('menu.announceAdd')}
              </button>
            </span>
          ) : null}

          <h3 className="a2-h4 a2-mt12">{x('menu.icons')}</h3>
          <p className="a2-xs a2-mute">{x('menu.iconsHelp')}</p>
          <List kind="icons" list="icons" drag={drag} empty="" label={x('menu.icons')} isEmpty={false} testId="bm-menu-icons">
            {v.icons.map((ic, i) => (
              <Row key={ic.id} kind="icons" list="icons" id={ic.id} index={i} count={v.icons.length} drag={drag} nudge={(d) => set({ icons: nudgeIn(v.icons, ic.id, d) })} disabled={card.off} x={x} name={x(`icon.${ic.id}`)} testId={`bm-menu-icon-${ic.id}`}>
                <span className="bm-name">{x(`icon.${ic.id}`)}</span>
                {ic.id === 'bag' ? <span className="a2-xs a2-mute">{x('menu.bagAlways')}</span> : <Show on={ic.on} label={x('show')} disabled={card.off} onChange={(on) => set({ icons: patch(v.icons, ic.id, { on }) })} testId={`bm-menu-icon-${ic.id}-on`} />}
              </Row>
            ))}
          </List>

          <h3 className="a2-h4 a2-mt12">{x('menu.items')}</h3>
          <p className="a2-xs a2-mute">{x('menu.itemsHelp')}</p>
          <List kind="items" list="items" drag={drag} empty={x('menu.itemsEmpty')} label={x('menu.items')} isEmpty={!v.items.length} testId="bm-menu-items">
            {v.items.map((it, i) => (
              <Row key={it.id} kind="items" list="items" id={it.id} index={i} count={v.items.length} drag={drag} nudge={(d) => set({ items: nudgeIn(v.items, it.id, d) })} disabled={card.off} x={x} name={nm(it.label, it.cat || it.id)} testId={`bm-menu-item-${it.id}`}
                actions={
                  !it.builtIn ? (
                    <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ items: v.items.filter((r) => r.id !== it.id) })} data-testid={`bm-menu-item-${it.id}-remove`}>
                      {x('remove')}
                    </button>
                  ) : null
                }
              >
                {it.label || !it.builtIn ? (
                  <PairInputs label={x('menu.itemLabel')} value={it.label} max={160} disabled={card.off} onChange={(p) => set({ items: patch(v.items, it.id, { label: p ?? blank }) })} testId={`bm-menu-item-${it.id}-label`} x={x} />
                ) : (
                  <span className="bm-name">{it.cat ? x('menu.category').replace('{cat}', it.cat) : it.id}</span>
                )}
                {it.editHref ? (
                  <div className="a2-fld">
                    <label className="a2-lbl" htmlFor={`${id}-i-${it.id}`}>
                      {x('menu.link')}
                    </label>
                    <input id={`${id}-i-${it.id}`} className="a2-inp" placeholder="/help/size-guide" maxLength={300} value={it.href} disabled={card.off} onChange={(e) => set({ items: patch(v.items, it.id, { href: e.target.value }) })} data-testid={`bm-menu-item-${it.id}-href`} />
                  </div>
                ) : null}
                <div className="bm-tgls">
                  <Show on={it.on} label={x('show')} disabled={card.off} onChange={(on) => set({ items: patch(v.items, it.id, { on }) })} testId={`bm-menu-item-${it.id}-on`} />
                  <Show on={it.desk} label={x('menu.desk')} disabled={card.off || !it.on} onChange={(desk) => set({ items: patch(v.items, it.id, { desk }) })} testId={`bm-menu-item-${it.id}-desk`} />
                  <Show on={it.phone} label={x('menu.phone')} disabled={card.off || !it.on} onChange={(phone) => set({ items: patch(v.items, it.id, { phone }) })} testId={`bm-menu-item-${it.id}-phone`} />
                </div>
              </Row>
            ))}
          </List>
          {v.items.length < 60 && props.canEdit ? (
            <span>
              <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ items: [...v.items, { id: newId('link', ids, v.items.length + 1), kind: 'link', label: { ...blank }, cat: '', href: '', editHref: true, on: true, desk: true, phone: true, builtIn: false }] })} data-testid="bm-menu-item-add">
                {x('menu.itemAdd')}
              </button>
            </span>
          ) : null}
        </div>
        <MenuPreview v={v} lang={lang} x={x} />
      </div>
    </Frame>
  );
}

function MenuPreview(props: { v: MenuCardValue; lang: 'en' | 'bn'; x: (k: string) => string }) {
  const { v, lang, x } = props;
  const first = v.announceOn ? v.announce.find((m) => m.on) : undefined;
  const label = (i: MenuCardValue['items'][number]) => pick(i.label, lang) || i.cat || i.id;
  return (
    <div className="bm-prev" data-testid="bm-menu-preview" aria-label={x('preview.label')}>
      {first ? <div className="bm-ann">{pick(first.text, lang)}</div> : null}
      <div className="bm-dev" data-testid="bm-menu-desk">
        <span className="a2-xs a2-mute">{x('preview.desktop')}</span>
        <div className="bm-navrow">
          {v.items.filter((i) => i.on && i.desk).map((i) => (
            <span key={i.id} className="bm-chip">
              {label(i)}
            </span>
          ))}
          <span className="bm-icons">{v.icons.filter((i) => i.on || i.id === 'bag').map((i) => x(`icon.${i.id}`)).join(' · ')}</span>
        </div>
      </div>
      <div className="bm-dev" data-testid="bm-menu-phone">
        <span className="a2-xs a2-mute">{x('preview.phone')}</span>
        <ul className="bm-phonelist">
          {v.items.filter((i) => i.on && i.phone).map((i) => (
            <li key={i.id}>{label(i)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---- Footer ----

function FooterCard(props: BrandEditorProps & { x: (k: string) => string; onSaved: (p: BrandPreviews) => void }) {
  const { x, lang } = props;
  const id = useId();
  const check = (v: FooterCardValue) => {
    const bad = v.promise.some((p) => !p.builtIn && (!p.text.en.trim() || !p.text.bn.trim())) || v.columns.some((c) => (!c.builtIn && (!c.title.en.trim() || !c.title.bn.trim())) || c.links.some((l) => !l.builtIn && (!l.label || !l.label.en.trim() || !l.label.bn.trim() || !l.href.trim())));
    return bad ? x('fillNew') : null;
  };
  const card = useCard(props.footer, x, props.canEdit, props.onSaved, check);
  const v = card.draft;
  const set = (change: Partial<FooterCardValue>) => card.edit({ ...v, ...change });
  const allIds = [...v.promise.map((p) => p.id), ...v.columns.flatMap((c) => [c.id, ...c.links.map((l) => l.id)])];
  const setCol = (colId: string, change: Partial<FooterColumnRow>) => set({ columns: patch(v.columns, colId, change) });
  const setLink = (colId: string, linkId: string, change: Partial<FooterLinkRow>) => set({ columns: v.columns.map((c) => (c.id === colId ? { ...c, links: patch(c.links, linkId, change) } : c)) });
  const drag = useDragging({
    disabled: card.off,
    onDrop: (f, t) => {
      if (f.kind === 'blocks') set({ blocks: place(v.blocks, f.id, t.before) });
      else if (f.kind === 'promise') set({ promise: place(v.promise, f.id, t.before) });
      else if (f.kind === 'columns') set({ columns: place(v.columns, f.id, t.before) });
      else if (f.kind === 'links') set({ columns: moveLink(v.columns, f, t) });
      else if (f.kind === 'social') set({ social: place(v.social, f.id, t.before) });
      else if (f.kind === 'pay') set({ pay: place(v.pay, f.id, t.before) });
    },
    onNudge: (f, d) => {
      if (f.kind === 'blocks') set({ blocks: nudgeIn(v.blocks, f.id, d) });
      else if (f.kind === 'promise') set({ promise: nudgeIn(v.promise, f.id, d) });
      else if (f.kind === 'columns') set({ columns: nudgeIn(v.columns, f.id, d) });
      else if (f.kind === 'links') set({ columns: v.columns.map((c) => (c.id === f.list ? { ...c, links: nudgeIn(c.links, f.id, d) } : c)) });
      else if (f.kind === 'social') set({ social: nudgeIn(v.social, f.id, d) });
      else if (f.kind === 'pay') set({ pay: nudgeIn(v.pay, f.id, d) });
    },
  });
  const nm = (p: Pair | null, fb: string) => pick(p, lang) || fb;
  const setMarks = (kind: 'social' | 'pay', list: { id: string; on: boolean }[]) => (kind === 'social' ? set({ social: list }) : set({ pay: list }));
  const mark = (kind: 'social' | 'pay', m: { id: string; on: boolean }, i: number, list: { id: string; on: boolean }[]) => (
    <Row key={m.id} kind={kind} list={kind} id={m.id} index={i} count={list.length} drag={drag} nudge={(d) => setMarks(kind, nudgeIn(list, m.id, d))} disabled={card.off} x={x} name={pick(props.marks[`${kind}.${m.id}`] ?? null, lang) || m.id} testId={`bm-footer-${kind}-${m.id}`}>
      <span className="bm-name">{pick(props.marks[`${kind}.${m.id}`] ?? null, lang) || m.id}</span>
      {kind === 'social' && m.id !== 'whatsapp' ? (
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-u-${m.id}`}>
            {x('footer.address')}
          </label>
          <input id={`${id}-u-${m.id}`} className="a2-inp" type="url" inputMode="url" placeholder="https://" maxLength={500} value={v.urls[m.id as keyof FooterCardValue['urls']]} disabled={card.off} onChange={(e) => set({ urls: { ...v.urls, [m.id]: e.target.value } })} data-testid={`bm-footer-url-${m.id}`} />
        </div>
      ) : kind === 'social' ? (
        <span className="a2-xs a2-mute">{x('footer.whatsappNote')}</span>
      ) : null}
      <Show on={m.on} label={x('show')} disabled={card.off} onChange={(on) => setMarks(kind, patch(list, m.id, { on }))} testId={`bm-footer-${kind}-${m.id}-on`} />
    </Row>
  );
  return (
    <Frame id={id} title={x('footer.h')} sub={x('footer.d')} testId="bm-footer" canEdit={props.canEdit} readOnly={x('readOnly')} card={card} x={x}>
      <div className="bm-split">
        <div className="bm-stack">
          <h3 className="a2-h4">{x('footer.blocks')}</h3>
          <p className="a2-xs a2-mute">{x('footer.blocksHelp')}</p>
          <List kind="blocks" list="blocks" drag={drag} empty="" label={x('footer.blocks')} isEmpty={false} testId="bm-footer-blocks">
            {v.blocks.map((b, i) => (
              <Row key={b.id} kind="blocks" list="blocks" id={b.id} index={i} count={v.blocks.length} drag={drag} nudge={(d) => set({ blocks: nudgeIn(v.blocks, b.id, d) })} disabled={card.off} x={x} name={x(`footer.block.${b.id}`)} testId={`bm-footer-block-${b.id}`}>
                <span className="bm-name">{x(`footer.block.${b.id}`)}</span>
                {b.id === 'legal' ? <span className="a2-xs a2-mute">{x('footer.blockLegal')}</span> : <Show on={b.on} label={x('show')} disabled={card.off} onChange={(on) => set({ blocks: patch(v.blocks, b.id, { on }) })} testId={`bm-footer-block-${b.id}-on`} />}
              </Row>
            ))}
          </List>

          <h3 className="a2-h4 a2-mt12">{x('footer.promise')}</h3>
          <Show on={v.promiseOn} label={x('footer.promiseOn')} disabled={card.off} onChange={(promiseOn) => set({ promiseOn })} testId="bm-footer-promise-on" />
          <List kind="promise" list="promise" drag={drag} empty={x('footer.promiseEmpty')} label={x('footer.promise')} isEmpty={!v.promise.length} testId="bm-footer-promise">
            {v.promise.map((p, i) => (
              <Row key={p.id} kind="promise" list="promise" id={p.id} index={i} count={v.promise.length} drag={drag} nudge={(d) => set({ promise: nudgeIn(v.promise, p.id, d) })} disabled={card.off} x={x} name={nm(p.text, p.id)} testId={`bm-footer-promise-${p.id}`}
                actions={
                  !p.builtIn ? (
                    <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ promise: v.promise.filter((r) => r.id !== p.id) })} data-testid={`bm-footer-promise-${p.id}-remove`}>
                      {x('remove')}
                    </button>
                  ) : null
                }
              >
                <PairInputs label={x('footer.promiseText')} value={p.text} max={160} disabled={card.off} onChange={(t) => set({ promise: patch(v.promise, p.id, { text: t ?? blank }) })} testId={`bm-footer-promise-${p.id}-text`} x={x} />
                <Show on={p.on} label={x('show')} disabled={card.off} onChange={(on) => set({ promise: patch(v.promise, p.id, { on }) })} testId={`bm-footer-promise-${p.id}-on`} />
              </Row>
            ))}
          </List>
          {v.promise.length < 6 && props.canEdit ? (
            <span>
              <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ promise: [...v.promise, { id: newId('promise', allIds, v.promise.length + 1), text: { ...blank }, on: true, builtIn: false }] })} data-testid="bm-footer-promise-add">
                {x('footer.promiseAdd')}
              </button>
            </span>
          ) : null}

          <h3 className="a2-h4 a2-mt12">{x('footer.join')}</h3>
          <Show on={v.joinOn} label={x('footer.joinOn')} disabled={card.off} onChange={(joinOn) => set({ joinOn })} testId="bm-footer-join-on" />
          <span className="a2-xs a2-mute">{x('footer.joinHelp')}</span>

          <h3 className="a2-h4 a2-mt12">{x('footer.columns')}</h3>
          <p className="a2-xs a2-mute">{x('footer.columnsHelp')}</p>
          <List kind="columns" list="columns" drag={drag} empty={x('footer.columnsEmpty')} label={x('footer.columns')} isEmpty={!v.columns.length} testId="bm-footer-columns">
            {v.columns.map((c, ci) => (
              <Row key={c.id} kind="columns" list="columns" id={c.id} index={ci} count={v.columns.length} drag={drag} nudge={(d) => set({ columns: nudgeIn(v.columns, c.id, d) })} disabled={card.off} x={x} name={nm(c.title, c.id)} testId={`bm-footer-col-${c.id}`}
                actions={
                  !c.builtIn ? (
                    <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ columns: v.columns.filter((r) => r.id !== c.id) })} data-testid={`bm-footer-col-${c.id}-remove`}>
                      {x('remove')}
                    </button>
                  ) : null
                }
              >
                <PairInputs label={x('footer.colTitle')} value={c.title} max={160} disabled={card.off} onChange={(t) => setCol(c.id, { title: t ?? blank })} testId={`bm-footer-col-${c.id}-title`} x={x} />
                <Show on={c.on} label={x('show')} disabled={card.off} onChange={(on) => setCol(c.id, { on })} testId={`bm-footer-col-${c.id}-on`} />
                <List kind="links" list={c.id} drag={drag} empty={x('footer.linksEmpty')} label={`${x('footer.links')}: ${nm(c.title, c.id)}`} isEmpty={!c.links.length} testId={`bm-footer-links-${c.id}`}>
                  {c.links.map((l, li) => (
                    <Row key={l.id} kind="links" list={c.id} id={l.id} index={li} count={c.links.length} drag={drag} nudge={(d) => set({ columns: v.columns.map((k) => (k.id === c.id ? { ...k, links: nudgeIn(k.links, l.id, d) } : k)) })} disabled={card.off} x={x} name={nm(l.label, l.cat || l.id)} testId={`bm-footer-link-${l.id}`}
                      actions={
                        <>
                          {v.columns.length > 1 ? (
                            <select className="a2-sel bm-mv" aria-label={`${x('footer.moveTo')}: ${nm(l.label, l.cat || l.id)}`} value={c.id} disabled={card.off} onChange={(e) => set({ columns: moveLink(v.columns, { list: c.id, id: l.id }, { list: e.target.value, before: null }) })} data-testid={`bm-footer-link-${l.id}-col`}>
                              {v.columns.map((k) => (
                                <option key={k.id} value={k.id}>
                                  {nm(k.title, k.id)}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {!l.builtIn ? (
                            <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ columns: v.columns.map((k) => (k.id === c.id ? { ...k, links: k.links.filter((r) => r.id !== l.id) } : k)) })} data-testid={`bm-footer-link-${l.id}-remove`}>
                              {x('remove')}
                            </button>
                          ) : null}
                        </>
                      }
                    >
                      {l.label || !l.builtIn ? (
                        <PairInputs label={x('footer.linkLabel')} value={l.label} max={160} disabled={card.off} onChange={(t) => setLink(c.id, l.id, { label: t ?? blank })} testId={`bm-footer-link-${l.id}-label`} x={x} />
                      ) : (
                        <span className="bm-name">{l.cat ? x('menu.category').replace('{cat}', l.cat) : l.id}</span>
                      )}
                      {l.editHref ? (
                        <div className="a2-fld">
                          <label className="a2-lbl" htmlFor={`${id}-l-${l.id}`}>
                            {x('menu.link')}
                          </label>
                          <input id={`${id}-l-${l.id}`} className="a2-inp" placeholder="/help/faq" maxLength={300} value={l.href} disabled={card.off} onChange={(e) => setLink(c.id, l.id, { href: e.target.value })} data-testid={`bm-footer-link-${l.id}-href`} />
                        </div>
                      ) : null}
                      <div className="bm-opts">
                        <div className="a2-fld">
                          <label className="a2-lbl" htmlFor={`${id}-i-${l.id}`}>
                            {x('footer.linkIcon')}
                          </label>
                          <select id={`${id}-i-${l.id}`} className="a2-sel" value={l.icon ?? ''} disabled={card.off} onChange={(e) => setLink(c.id, l.id, { icon: e.target.value })} data-testid={`bm-footer-link-${l.id}-icon`}>
                            <option value="">{x('footer.iconDefault')}</option>
                            {props.icons.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="a2-fld">
                          <label className="a2-lbl" htmlFor={`${id}-d-${l.id}`}>
                            {x('footer.linkScreens')}
                          </label>
                          <select id={`${id}-d-${l.id}`} className="a2-sel" value={l.dev ?? 'both'} disabled={card.off} onChange={(e) => setLink(c.id, l.id, { dev: e.target.value as LinkScreen })} data-testid={`bm-footer-link-${l.id}-dev`}>
                            <option value="both">{x('footer.screens.both')}</option>
                            <option value="desk">{x('footer.screens.desk')}</option>
                            <option value="phone">{x('footer.screens.phone')}</option>
                          </select>
                        </div>
                      </div>
                      <Show on={l.on} label={x('show')} disabled={card.off} onChange={(on) => setLink(c.id, l.id, { on })} testId={`bm-footer-link-${l.id}-on`} />
                    </Row>
                  ))}
                </List>
                {c.links.length < 12 && props.canEdit ? (
                  <span>
                    <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => setCol(c.id, { links: [...c.links, { id: newId('link', allIds, c.links.length + 1), label: { ...blank }, cat: '', href: '', editHref: true, on: true, builtIn: false }] })} data-testid={`bm-footer-col-${c.id}-addlink`}>
                      {x('footer.linkAdd')}
                    </button>
                  </span>
                ) : null}
              </Row>
            ))}
          </List>
          {v.columns.length < 5 && props.canEdit ? (
            <span>
              <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ columns: [...v.columns, { id: newId('col', allIds, v.columns.length + 1), title: { ...blank }, on: true, builtIn: false, links: [] }] })} data-testid="bm-footer-col-add">
                {x('footer.colAdd')}
              </button>
            </span>
          ) : null}

          <h3 className="a2-h4 a2-mt12">{x('footer.contact')}</h3>
          <p className="a2-xs a2-mute">{x('footer.contactHelp')}</p>
          <div className="bm-tgls">
            {(['whatsapp', 'hotline', 'hours'] as const).map((k) => (
              <Show key={k} on={v.contact[k]} label={x(`footer.contactOpt.${k}`)} disabled={card.off} onChange={(on) => set({ contact: { ...v.contact, [k]: on } })} testId={`bm-footer-contact-${k}`} />
            ))}
          </div>

          <h3 className="a2-h4 a2-mt12">{x('footer.social')}</h3>
          <p className="a2-xs a2-mute">{x('footer.socialHelp')}</p>
          <List kind="social" list="social" drag={drag} empty="" label={x('footer.social')} isEmpty={false} testId="bm-footer-social">
            {v.social.map((m, i) => mark('social', m, i, v.social))}
          </List>

          <h3 className="a2-h4 a2-mt12">{x('footer.pay')}</h3>
          <p className="a2-xs a2-mute">{x('footer.payHelp')}</p>
          <List kind="pay" list="pay" drag={drag} empty="" label={x('footer.pay')} isEmpty={false} testId="bm-footer-pay">
            {v.pay.map((m, i) => mark('pay', m, i, v.pay))}
          </List>

          <PairInputs label={x('footer.copyright')} value={v.copyright} max={160} disabled={card.off} onChange={(p) => set({ copyright: p ?? blank })} testId="bm-footer-copyright" help={x('footer.copyrightHelp')} x={x} />
        </div>
        <FooterPreview v={v} lang={lang} marks={props.marks} x={x} />
      </div>
    </Frame>
  );
}

function FooterPreview(props: { v: FooterCardValue; lang: 'en' | 'bn'; marks: Record<string, Pair>; x: (k: string) => string }) {
  const { v, lang, x } = props;
  const word = (kind: 'social' | 'pay', id: string) => pick(props.marks[`${kind}.${id}`] ?? null, lang) || id;
  const body = (cls: string, testId: string, title: string) => (
    <div className={`bm-dev ${cls}`} data-testid={testId}>
      <span className="a2-xs a2-mute">{title}</span>
      <div className="bm-foot">
        {v.promiseOn ? <div className="bm-promise">{v.promise.filter((p) => p.on).map((p) => <span key={p.id} className="bm-chip">{pick(p.text, lang)}</span>)}</div> : null}
        <div className="bm-cols">
          {v.columns.filter((c) => c.on).map((c) => (
            <div key={c.id} className="bm-col">
              <strong>{pick(c.title, lang)}</strong>
              {c.links.filter((l) => l.on).map((l) => (
                <span key={l.id}>{pick(l.label, lang) || l.cat || l.id}</span>
              ))}
            </div>
          ))}
        </div>
        {v.joinOn ? <div className="bm-join a2-xs a2-mute">{x('preview.join')}</div> : null}
        <div className="bm-marks">{v.social.filter((m) => m.on).map((m) => word('social', m.id)).join(' · ')}</div>
        <div className="bm-marks">{v.pay.filter((m) => m.on).map((m) => word('pay', m.id)).join(' · ')}</div>
        <div className="a2-xs a2-mute">{pick(v.copyright, lang)}</div>
      </div>
    </div>
  );
  return (
    <div className="bm-prev" data-testid="bm-footer-preview" aria-label={x('preview.label')}>
      {body('bm-dev-desk', 'bm-footer-desk', x('preview.desktop'))}
      {body('bm-dev-phone', 'bm-footer-phone', x('preview.phone'))}
    </div>
  );
}

export function BrandMenusEditor(props: BrandEditorProps) {
  const [previews, setPreviews] = useState(props.previews);
  const x = (k: string) => props.texts[k] ?? k;
  return (
    <div className="bm" data-testid="bm-editor">
      <BrandCard {...props} previews={previews} onSaved={setPreviews} x={x} />
      <ContactCard {...props} previews={previews} onSaved={setPreviews} x={x} />
      <MenuCard {...props} x={x} onSaved={setPreviews} />
      <FooterCard {...props} x={x} onSaved={setPreviews} />
    </div>
  );
}
