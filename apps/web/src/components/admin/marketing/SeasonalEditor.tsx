'use client';
// S12 · PR 246 — the seasonal page editor (Marketing › Landing pages › Seasonal pages): the headline, the link, the
// occasion and the intro; the parts switched on or off in their fixed order; the collection and the journal category;
// the owner's line, reasons and countdown; Save (with the version the page was read at: STALE = someone changed it, the
// page is read again), Make live (asks once more), Take down, Archive (asks once more), Restore, Open and Copy link.
// Nothing is deleted. Without `marketing.landing.write` everything is read-only. Prices are never typed here.
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { SEASONAL_SECTIONS, slugify, type PageState, type SeasonalSection, type SeasonalSectionKey } from '@/lib/marketing/seasonal-model';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface EditorPage {
  id: string | null;
  slug: string;
  titleEn: string;
  titleBn: string | null;
  introEn: string | null;
  introBn: string | null;
  occasion: string | null;
  state: PageState;
  lastLive: string | null;
  sections: SeasonalSection[];
  version: string | null;
}

type Step = 'publish' | 'unpublish' | 'archive' | 'restore';
const API = '/api/admin/marketing/seasonal-pages';
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
/** A stored instant as the browser's `datetime-local` value (its own clock), and back. */
const toLocal = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export function SeasonalEditor(p: {
  words: Dict;
  page: EditorPage;
  occasions: { key: string; name: string }[];
  collections: { id: string; name: string; seasonal: boolean }[];
  categories: { id: string; name: string }[];
  origin: string;
  canWrite: boolean;
  listHref: string;
  locale: string;
}) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.words, `sp.${k}`, vars);
  const pg = p.page;
  const conf = (k: SeasonalSectionKey) => pg.sections.find((s) => s.key === k)?.config ?? {};
  const [titleEn, setTitleEn] = useState(pg.titleEn);
  const [titleBn, setTitleBn] = useState(pg.titleBn ?? '');
  const [slug, setSlug] = useState(pg.slug);
  const [slugTouched, setSlugTouched] = useState(!!pg.id);
  const [occasion, setOccasion] = useState(pg.occasion ?? '');
  const [introEn, setIntroEn] = useState(pg.introEn ?? '');
  const [introBn, setIntroBn] = useState(pg.introBn ?? '');
  const [on, setOn] = useState<Record<SeasonalSectionKey, boolean>>(Object.fromEntries(pg.sections.map((s) => [s.key, s.on])) as Record<SeasonalSectionKey, boolean>);
  const [collectionId, setCollectionId] = useState(conf('products').collectionId ?? '');
  const [categoryId, setCategoryId] = useState(conf('articles').categoryId ?? '');
  const [offerEn, setOfferEn] = useState(conf('hero').offer?.en ?? '');
  const [offerBn, setOfferBn] = useState(conf('hero').offer?.bn ?? '');
  const [whyEn, setWhyEn] = useState((conf('reasons').lines ?? []).map((l) => l.en).join('\n'));
  const [whyBn, setWhyBn] = useState((conf('reasons').lines ?? []).map((l) => l.bn ?? '').join('\n'));
  const [endsAt, setEndsAt] = useState(toLocal(conf('timer').endsAt));
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Step | null>(null);
  const [dirty, setDirty] = useState(!pg.id);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const ro = !p.canWrite || pg.state === 'archived';
  const off = ro || busy;
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
    setAsk(null);
  };
  // an occasion the owner has since removed from his list stays pickable on the page that has it
  const occasions = pg.occasion && !p.occasions.some((o) => o.key === pg.occasion) ? [...p.occasions, { key: pg.occasion, name: pg.occasion }] : p.occasions;

  function errText(a: { status: number; data: { error?: string; details?: string[] } }) {
    const code = a.data.error ?? 'other';
    if (a.status === 0) return c('err.network');
    if (a.status === 401) return c('err.unauthorized');
    if (a.status === 403) return c('err.forbidden');
    const k = `err.${code}`;
    const fields = (a.data.details ?? []).map((f) => (c(`fld.${f}`) === `sp.fld.${f}` ? f : c(`fld.${f}`))).join(', ');
    const txt = c(k, { fields });
    return txt === `sp.${k}` ? c('err.other') : txt;
  }

  function partsBody() {
    const why = lines(whyEn);
    const wbn = whyBn.split('\n').map((x) => x.trim());
    const config = (k: SeasonalSectionKey) =>
      k === 'hero'
        ? { offer: { en: offerEn, bn: offerBn } }
        : k === 'reasons'
          ? { lines: why.map((en, i) => ({ en, bn: wbn[i] || null })) }
          : k === 'timer'
            ? { endsAt: fromLocal(endsAt) }
            : k === 'products'
              ? { collectionId: collectionId || null }
              : k === 'articles'
                ? { categoryId: categoryId || null }
                : {};
    return Object.fromEntries(SEASONAL_SECTIONS.map((k) => [k, { on: on[k], config: config(k) }]));
  }

  async function save() {
    setBusy(true);
    setSaid(null);
    const body = { titleEn, titleBn: titleBn || null, slug, occasion, introEn: introEn || null, introBn: introBn || null, sections: partsBody(), version: pg.version };
    const a = await call(pg.id ? 'PUT' : 'POST', pg.id ? `${API}/${pg.id}` : API, body);
    setBusy(false);
    if (a.status === 200 || a.status === 201) {
      setDirty(false);
      showToast({ text: c('b.saved'), tone: 'ok' });
      const nid = (a.data.page as { id?: string } | undefined)?.id;
      if (!pg.id && nid) return router.replace(`${p.listHref}/${nid}`);
      return router.refresh();
    }
    setSaid({ text: errText(a), bad: true });
    if (a.status === 409 && a.data.error === 'STALE') router.refresh();
  }

  async function step(s: Step) {
    if (dirty) return setSaid({ text: c('b.unsavedFirst'), bad: true });
    if ((s === 'publish' || s === 'archive') && ask !== s) return setAsk(s);
    setAsk(null);
    setBusy(true);
    const a = await call('POST', `${API}/${pg.id}`, { action: s, version: pg.version });
    setBusy(false);
    if (a.status === 200) {
      showToast({ text: c(`state.${(a.data.page as { state: PageState }).state}`), tone: 'ok' });
      return router.refresh();
    }
    setSaid({ text: errText(a), bad: true });
    if (a.status === 409 && a.data.error === 'STALE') router.refresh();
  }

  const link = `${p.origin}/collections/${slug || '…'}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      showToast({ text: c('b.copied'), tone: 'ok' });
    } catch {
      setSaid({ text: link, bad: false });
    }
  }

  const fld = (key: string, label: string, el: ReactNode, help?: string) => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      {el}
      {help ? <div className="a2-help a2-xs a2-mute">{help}</div> : null}
    </div>
  );
  const lastLive = pg.lastLive ? new Intl.DateTimeFormat(p.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(pg.lastLive)) : null;

  return (
    <div className="a2-mt12">
      <div className="lp-stack">
        <section className="a2-card a2-sc" aria-labelledby={`${id}-ph`}>
          <h2 className="a2-h3" id={`${id}-ph`}>
            {c('b.page')}
          </h2>
          <div className="lp-g2 a2-mt12">
            {fld(
              'ten',
              c('b.headline'),
              <input
                id={`${id}-ten`}
                className="a2-inp"
                value={titleEn}
                maxLength={120}
                disabled={off}
                onChange={(e) => {
                  touch(setTitleEn)(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                data-testid="sp-title"
              />,
            )}
            {fld('tbn', c('b.headlineBn'), <input id={`${id}-tbn`} className="a2-inp" value={titleBn} maxLength={120} disabled={off} onChange={(e) => touch(setTitleBn)(e.target.value)} lang="bn" />)}
            {fld(
              'oc',
              c('b.occasion'),
              <select id={`${id}-oc`} className="a2-sel" value={occasion} disabled={off} onChange={(e) => touch(setOccasion)(e.target.value)} data-testid="sp-occasion">
                <option value="">{c('b.occasionPick')}</option>
                {occasions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                  </option>
                ))}
              </select>,
            )}
            {fld(
              'sl',
              c('b.link'),
              <input
                id={`${id}-sl`}
                className="a2-inp a2-mono"
                value={slug}
                maxLength={60}
                disabled={off}
                placeholder="eid"
                onChange={(e) => {
                  setSlugTouched(true);
                  touch(setSlug)(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]+/g, '-')
                      .replace(/-{2,}/g, '-')
                      .replace(/^-+/, ''),
                  );
                }}
                onBlur={() => setSlug(slugify(slug))}
                data-testid="sp-slug"
              />,
              c('b.linkHelp', { domain: p.origin, slug: slug || '…' }),
            )}
            {fld('ie', c('b.intro'), <textarea id={`${id}-ie`} className="a2-inp" value={introEn} maxLength={600} disabled={off} onChange={(e) => touch(setIntroEn)(e.target.value)} data-testid="sp-intro" />)}
            {fld('ib', c('b.introBn'), <textarea id={`${id}-ib`} className="a2-inp" value={introBn} maxLength={600} disabled={off} onChange={(e) => touch(setIntroBn)(e.target.value)} lang="bn" />)}
          </div>
        </section>

        <section className="a2-card a2-sc" aria-labelledby={`${id}-pt`} data-testid="sp-parts">
          <h2 className="a2-h3" id={`${id}-pt`}>
            {c('b.parts')}
          </h2>
          <p className="a2-cs">{c('b.partsSub')}</p>
          <div className="a2-mt12">
            {SEASONAL_SECTIONS.map((k, i) => (
              <div key={k} className={`lp-part${on[k] ? '' : ' off'}`}>
                <span className="lp-pn">{i + 1}</span>
                <div className="a2-swl">
                  <span id={`${id}-p-${k}`}>{c(`b.part.${k}`)}</span>
                  <button type="button" className={`a2-sw${on[k] ? ' on' : ''}`} role="switch" aria-checked={on[k]} aria-labelledby={`${id}-p-${k}`} disabled={off} onClick={() => touch(setOn)({ ...on, [k]: !on[k] })} data-testid={`sp-part-${k}`} />
                </div>
              </div>
            ))}
          </div>
          {on.cutoff ? <p className="a2-xs a2-mute a2-mt12">{c('b.cutoffHelp')}</p> : null}
        </section>

        <section className="a2-card a2-sc" aria-labelledby={`${id}-pk`}>
          <h2 className="a2-h3" id={`${id}-pk`}>
            {c('b.picks')}
          </h2>
          <p className="a2-cs">{c('b.picksSub')}</p>
          <div className="lp-g2 a2-mt12">
            {fld(
              'co',
              c('b.collection'),
              <select id={`${id}-co`} className="a2-sel" value={collectionId} disabled={off} onChange={(e) => touch(setCollectionId)(e.target.value)} data-testid="sp-collection">
                <option value="">{c('b.collectionPick')}</option>
                {p.collections.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.seasonal ? `${x.name} (${c('b.seasonalTag')})` : x.name}
                  </option>
                ))}
              </select>,
              c('b.collectionHelp'),
            )}
            {fld(
              'ca',
              c('b.category'),
              <select id={`${id}-ca`} className="a2-sel" value={categoryId} disabled={off} onChange={(e) => touch(setCategoryId)(e.target.value)} data-testid="sp-category">
                <option value="">{c('b.categoryPick')}</option>
                {p.categories.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>,
              c('b.categoryHelp'),
            )}
          </div>
        </section>

        <section className="a2-card a2-sc" aria-labelledby={`${id}-wd`}>
          <h2 className="a2-h3" id={`${id}-wd`}>
            {c('b.words')}
          </h2>
          <p className="a2-cs">{c('b.wordsSub')}</p>
          <div className="lp-g2 a2-mt12">
            {fld('oe', c('b.offer'), <input id={`${id}-oe`} className="a2-inp" value={offerEn} maxLength={120} disabled={off} onChange={(e) => touch(setOfferEn)(e.target.value)} data-testid="sp-offer" />)}
            {fld('ob', c('b.offerBn'), <input id={`${id}-ob`} className="a2-inp" value={offerBn} maxLength={120} disabled={off} onChange={(e) => touch(setOfferBn)(e.target.value)} lang="bn" />)}
            {fld('we', c('b.reasons'), <textarea id={`${id}-we`} className="a2-inp" value={whyEn} disabled={off} onChange={(e) => touch(setWhyEn)(e.target.value)} data-testid="sp-reasons" />)}
            {fld('wb', c('b.reasonsBn'), <textarea id={`${id}-wb`} className="a2-inp" value={whyBn} disabled={off} onChange={(e) => touch(setWhyBn)(e.target.value)} lang="bn" />)}
            {fld('te', c('b.timerEnd'), <input id={`${id}-te`} type="datetime-local" className="a2-inp" value={endsAt} disabled={off} onChange={(e) => touch(setEndsAt)(e.target.value)} />, c('b.timerHelp'))}
          </div>
        </section>

        <div className="lp-acts" data-testid="sp-actions">
          {p.canWrite && pg.state !== 'archived' ? (
            <button type="button" className="a2-btn pri" disabled={busy || !titleEn.trim() || !slug || !occasion} onClick={save} data-testid="sp-save">
              {busy ? c('b.saving') : pg.id ? c('b.save') : c('b.createPage')}
            </button>
          ) : null}
          {p.canWrite && pg.id && (pg.state === 'draft' || pg.state === 'off') ? (
            <button type="button" className={`a2-btn${ask === 'publish' ? ' pri' : ''}`} disabled={busy} onClick={() => step('publish')} data-testid="sp-publish">
              {ask === 'publish' ? c('b.publishConfirm') : c('b.publish')}
            </button>
          ) : null}
          {p.canWrite && pg.state === 'live' ? (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => step('unpublish')} data-testid="sp-unpublish">
              {c('b.unpublish')}
            </button>
          ) : null}
          {p.canWrite && pg.id && pg.state !== 'archived' ? (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => step('archive')} data-testid="sp-archive">
              {ask === 'archive' ? c('b.archiveConfirm') : c('b.archive')}
            </button>
          ) : null}
          {p.canWrite && pg.state === 'archived' ? (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => step('restore')} data-testid="sp-restore">
              {c('b.restore')}
            </button>
          ) : null}
          {pg.state === 'live' ? (
            <a className="a2-btn" href={`/collections/${encodeURIComponent(pg.slug)}`} target="_blank" rel="noopener" data-testid="sp-open">
              {c('b.open')}
            </a>
          ) : null}
          {pg.id ? (
            <button type="button" className="a2-btn" onClick={copy} data-testid="sp-copy">
              {c('b.copy')}
            </button>
          ) : null}
        </div>
        {said ? (
          <p className={`a2-sm lp-said ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="sp-said">
            {said.text}
          </p>
        ) : null}
        {!p.canWrite ? <p className="a2-xs a2-mute">{c('b.readOnly')}</p> : null}
        {pg.id ? <p className="a2-xs a2-mute">{c('b.stateLine', { state: c(`state.${pg.state}`) })}</p> : null}
        {lastLive ? (
          <p className="a2-xs a2-mute" data-testid="sp-last-live">
            {c('b.lastLive', { date: lastLive })}
          </p>
        ) : null}
        <p className="a2-xs a2-mute">{c('b.reuse')}</p>
      </div>
    </div>
  );
}
