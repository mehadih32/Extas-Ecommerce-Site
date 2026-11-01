'use client';
// S13 · PR 254 (Blueprint MKT-05, demo 97x-adm2-marketing.js) — the landing page builder: the page's fields, its parts
// switched on or off in their fixed order, the parts' own words, a phone sketch and the page's steps. Saving sends the
// version the page was read at (STALE = someone changed it; the page is read again). Publish and Archive ask once more.
// Without `marketing.landing.write` everything is read-only. Prices are never typed here: the shop shows the product's
// own live prices.
// PR 255: a new page starts from a template (ready-made or the owner's own: it fills the parts' switches and words, the
// page keeps its own copy); "Save these parts as a template" under More options keeps the parts on screen as an own
// template under a name.
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { LANDING_SECTIONS, sectionsOf, slugify, type LandingSection, type LandingSectionKey, type PageState } from '@/lib/marketing/landing-model';
import { call } from '../api';

export interface BuilderPage {
  id: string | null;
  slug: string;
  titleEn: string;
  titleBn: string | null;
  productId: string | null;
  campaignId: string | null;
  templateKey: string | null;
  state: PageState;
  sections: LandingSection[];
  version: string | null;
  orders: number;
  delivered: number;
}

/** A template a new page can start from (name null = a ready-made one, named in the messages). */
export interface BuilderTemplate {
  key: string;
  name: string | null;
  sections: LandingSection[];
}

type Step = 'publish' | 'unpublish' | 'archive' | 'restore';
const API = '/api/admin/marketing/landing-pages';
const TPL_API = '/api/admin/marketing/landing-templates';
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

export function LandingBuilder(p: {
  words: Dict;
  page: BuilderPage;
  products: { id: string; name: string; onSale: boolean }[];
  campaigns: { id: string; name: string }[];
  origin: string;
  canWrite: boolean;
  listHref: string;
  templates?: BuilderTemplate[];
  templatesHref?: string;
}) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.words, `lp.${k}`, vars);
  const pg = p.page;
  const conf = (k: LandingSectionKey) => pg.sections.find((s) => s.key === k)?.config ?? {};
  const [titleEn, setTitleEn] = useState(pg.titleEn);
  const [titleBn, setTitleBn] = useState(pg.titleBn ?? '');
  const [slug, setSlug] = useState(pg.slug);
  const [slugTouched, setSlugTouched] = useState(!!pg.id);
  const [productId, setProductId] = useState(pg.productId ?? '');
  const [campaignId, setCampaignId] = useState(pg.campaignId ?? '');
  const [on, setOn] = useState<Record<LandingSectionKey, boolean>>(Object.fromEntries(pg.sections.map((s) => [s.key, s.on])) as Record<LandingSectionKey, boolean>);
  const [offerEn, setOfferEn] = useState(conf('hero').offer?.en ?? '');
  const [offerBn, setOfferBn] = useState(conf('hero').offer?.bn ?? '');
  const [benEn, setBenEn] = useState((conf('benefits').lines ?? []).map((l) => l.en).join('\n'));
  const [benBn, setBenBn] = useState((conf('benefits').lines ?? []).map((l) => l.bn ?? '').join('\n'));
  const [endsAt, setEndsAt] = useState(toLocal(conf('timer').endsAt));
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Step | null>(null);
  const [dirty, setDirty] = useState(!pg.id);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [tpl, setTpl] = useState<string | null>(pg.templateKey);
  const [tplName, setTplName] = useState('');
  const [tplSaid, setTplSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const ro = !p.canWrite || pg.state === 'archived';
  const off = ro || busy;
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
    setAsk(null);
  };
  const product = p.products.find((x) => x.id === productId);

  function errText(a: { status: number; data: { error?: string; details?: string[] } }) {
    const code = a.data.error ?? 'other';
    if (a.status === 0) return c('err.network');
    if (a.status === 401) return c('err.unauthorized');
    if (a.status === 403) return c('err.forbidden');
    const k = `err.${code}`;
    const txt = c(k, { fields: (a.data.details ?? []).join(', ') });
    return txt === `lp.${k}` ? c('err.other') : txt;
  }

  const tplLabel = (t: BuilderTemplate) => t.name ?? c(`tpl.${t.key}.name`);
  const fromT = p.templates?.find((x) => x.key === pg.templateKey);
  const fromName = fromT ? tplLabel(fromT) : (pg.templateKey ?? '');
  /** Start the new page from a template (null = every part at its default, no words). */
  function startFrom(t: BuilderTemplate | null) {
    const secs = t?.sections ?? sectionsOf([]);
    const cf = (k: LandingSectionKey) => secs.find((x) => x.key === k)?.config ?? {};
    setOn(Object.fromEntries(secs.map((x) => [x.key, x.on])) as Record<LandingSectionKey, boolean>);
    setOfferEn(cf('hero').offer?.en ?? '');
    setOfferBn(cf('hero').offer?.bn ?? '');
    setBenEn((cf('benefits').lines ?? []).map((l) => l.en).join('\n'));
    setBenBn((cf('benefits').lines ?? []).map((l) => l.bn ?? '').join('\n'));
    setTpl(t?.key ?? null);
    setDirty(true);
    setAsk(null);
  }

  function partsBody() {
    const ben = lines(benEn);
    const bnl = benBn.split('\n').map((x) => x.trim());
    return Object.fromEntries(
      LANDING_SECTIONS.map((k) => [
        k,
        {
          on: on[k],
          config: k === 'hero' ? { offer: { en: offerEn, bn: offerBn } } : k === 'benefits' ? { lines: ben.map((en, i) => ({ en, bn: bnl[i] || null })) } : k === 'timer' ? { endsAt: fromLocal(endsAt) } : {},
        },
      ]),
    );
  }

  async function saveTemplate() {
    setBusy(true);
    setTplSaid(null);
    const a = await call('POST', TPL_API, { name: tplName, sections: partsBody() });
    setBusy(false);
    if (a.status === 201) {
      setTplName('');
      return setTplSaid({ text: c('t.savedAs', { name: (a.data.template as { name?: string } | undefined)?.name ?? '' }), bad: false });
    }
    setTplSaid({ text: errText(a), bad: true });
  }

  async function save() {
    setBusy(true);
    setSaid(null);
    const sections = partsBody();
    const body = { titleEn, titleBn: titleBn || null, slug, productId, campaignId: campaignId || null, sections, ...(pg.id ? {} : { templateKey: tpl }), version: pg.version };
    const a = await call(pg.id ? 'PUT' : 'POST', pg.id ? `${API}/${pg.id}` : API, body);
    setBusy(false);
    if (a.status === 200 || a.status === 201) {
      setDirty(false);
      setSaid({ text: c('b.saved'), bad: false });
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
      setSaid({ text: c(`state.${(a.data.page as { state: PageState }).state}`), bad: false });
      return router.refresh();
    }
    setSaid({ text: errText(a), bad: true });
    if (a.status === 409 && a.data.error === 'STALE') router.refresh();
  }

  const link = `${p.origin}/l/${slug || '…'}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setSaid({ text: c('b.copied'), bad: false });
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

  return (
    <div className="lp-grid a2-mt12">
      <div className="lp-stack">
        {!pg.id && p.canWrite && p.templates?.length ? (
          <section className="a2-card a2-sc" aria-labelledby={`${id}-tp`} data-testid="lp-templates">
            <h2 className="a2-h3" id={`${id}-tp`}>
              {c('t.start')}
            </h2>
            <p className="a2-cs">{c('t.startSub')}</p>
            <div className="lp-tpls a2-mt12" role="radiogroup" aria-labelledby={`${id}-tp`}>
              {[null, ...p.templates].map((x) => {
                const k = x?.key ?? '';
                const picked = (tpl ?? '') === k;
                const parts = (x?.sections ?? sectionsOf([])).filter((s) => s.on).length;
                return (
                  <button key={k || 'none'} type="button" role="radio" aria-checked={picked} className={`lp-tpl${picked ? ' on' : ''}`} disabled={busy} onClick={() => startFrom(x)} data-testid={`lp-tpl-${k || 'none'}`}>
                    <b>{x ? tplLabel(x) : c('t.blank')}</b>
                    <span className="a2-xs a2-mute">{x && !x.name ? c(`tpl.${x.key}.note`) : x ? c('t.own') : c('t.blankNote')}</span>
                    <span className="a2-xs">{c('t.partsOn', { n: parts })}</span>
                  </button>
                );
              })}
            </div>
            {p.templatesHref ? (
              <a className="a2-lnk lp-tlink" href={p.templatesHref}>
                {c('t.all')}
              </a>
            ) : null}
          </section>
        ) : null}
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
                data-testid="lp-title"
              />,
            )}
            {fld('tbn', c('b.headlineBn'), <input id={`${id}-tbn`} className="a2-inp" value={titleBn} maxLength={120} disabled={off} onChange={(e) => touch(setTitleBn)(e.target.value)} lang="bn" />)}
            {fld(
              'pr',
              c('b.product'),
              <select id={`${id}-pr`} className="a2-sel" value={productId} disabled={off} onChange={(e) => touch(setProductId)(e.target.value)} data-testid="lp-product">
                <option value="">{c('b.productPick')}</option>
                {p.products.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.onSale ? x.name : `${x.name} (${c('b.productOff')})`}
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
                placeholder="polo-duo"
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
                data-testid="lp-slug"
              />,
              c('b.linkHelp', { domain: p.origin, slug: slug || '…' }),
            )}
            {fld(
              'cp',
              c('b.campaign'),
              <select id={`${id}-cp`} className="a2-sel" value={campaignId} disabled={off} onChange={(e) => touch(setCampaignId)(e.target.value)}>
                <option value="">{c('b.campaignNone')}</option>
                {p.campaigns.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>,
            )}
          </div>
        </section>

        <section className="a2-card a2-sc" aria-labelledby={`${id}-pt`} data-testid="lp-parts">
          <h2 className="a2-h3" id={`${id}-pt`}>
            {c('b.parts')}
          </h2>
          <p className="a2-cs">{c('b.partsSub')}</p>
          <div className="a2-mt12">
            {LANDING_SECTIONS.map((k, i) => (
              <div key={k} className={`lp-part${on[k] ? '' : ' off'}`}>
                <span className="lp-pn">{i + 1}</span>
                <div className="a2-swl">
                  <span id={`${id}-p-${k}`}>{c(`b.part.${k}`)}</span>
                  <button type="button" className={`a2-sw${on[k] ? ' on' : ''}`} role="switch" aria-checked={on[k]} aria-labelledby={`${id}-p-${k}`} disabled={off} onClick={() => touch(setOn)({ ...on, [k]: !on[k] })} data-testid={`lp-part-${k}`} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="a2-card a2-sc" aria-labelledby={`${id}-wd`}>
          <h2 className="a2-h3" id={`${id}-wd`}>
            {c('b.words')}
          </h2>
          <p className="a2-cs">{c('b.wordsSub')}</p>
          <div className="lp-g2 a2-mt12">
            {fld('oe', c('b.offer'), <input id={`${id}-oe`} className="a2-inp" value={offerEn} maxLength={120} disabled={off} onChange={(e) => touch(setOfferEn)(e.target.value)} data-testid="lp-offer" />)}
            {fld('ob', c('b.offerBn'), <input id={`${id}-ob`} className="a2-inp" value={offerBn} maxLength={120} disabled={off} onChange={(e) => touch(setOfferBn)(e.target.value)} lang="bn" />)}
            {fld('be', c('b.benefits'), <textarea id={`${id}-be`} className="a2-inp" value={benEn} disabled={off} onChange={(e) => touch(setBenEn)(e.target.value)} data-testid="lp-benefits" />)}
            {fld('bb', c('b.benefitsBn'), <textarea id={`${id}-bb`} className="a2-inp" value={benBn} disabled={off} onChange={(e) => touch(setBenBn)(e.target.value)} lang="bn" />)}
            {fld('te', c('b.timerEnd'), <input id={`${id}-te`} type="datetime-local" className="a2-inp" value={endsAt} disabled={off} onChange={(e) => touch(setEndsAt)(e.target.value)} />, c('b.timerHelp'))}
          </div>
        </section>

        <div className="lp-acts" data-testid="lp-actions">
          {p.canWrite && pg.state !== 'archived' ? (
            <button type="button" className="a2-btn pri" disabled={busy || !titleEn.trim() || !slug || !productId} onClick={save} data-testid="lp-save">
              {busy ? c('b.saving') : pg.id ? c('b.save') : c('b.createPage')}
            </button>
          ) : null}
          {p.canWrite && pg.id && (pg.state === 'draft' || pg.state === 'off') ? (
            <button type="button" className={`a2-btn${ask === 'publish' ? ' pri' : ''}`} disabled={busy} onClick={() => step('publish')} data-testid="lp-publish">
              {ask === 'publish' ? c('b.publishConfirm') : c('b.publish')}
            </button>
          ) : null}
          {p.canWrite && pg.state === 'live' ? (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => step('unpublish')} data-testid="lp-unpublish">
              {c('b.unpublish')}
            </button>
          ) : null}
          {p.canWrite && pg.id && pg.state !== 'archived' ? (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => step('archive')} data-testid="lp-archive">
              {ask === 'archive' ? c('b.archiveConfirm') : c('b.archive')}
            </button>
          ) : null}
          {p.canWrite && pg.state === 'archived' ? (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => step('restore')} data-testid="lp-restore">
              {c('b.restore')}
            </button>
          ) : null}
          {pg.state === 'live' ? (
            <a className="a2-btn" href={`/l/${encodeURIComponent(pg.slug)}`} target="_blank" rel="noopener" data-testid="lp-open">
              {c('b.open')}
            </a>
          ) : null}
          {pg.id ? (
            <button type="button" className="a2-btn" onClick={copy} data-testid="lp-copy">
              {c('b.copy')}
            </button>
          ) : null}
        </div>
        {said ? (
          <p className={`a2-sm lp-said ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="lp-said">
            {said.text}
          </p>
        ) : null}
        {p.canWrite && pg.state !== 'archived' ? (
          <details className="a2-more-opts lp-more" data-testid="lp-more">
            <summary>{c('t.more')}</summary>
            <div className="a2-fld a2-mt12">
              <label className="a2-lbl" htmlFor={`${id}-tn`}>
                {c('t.saveName')}
              </label>
              <input id={`${id}-tn`} className="a2-inp" value={tplName} maxLength={80} disabled={busy} onChange={(e) => setTplName(e.target.value)} data-testid="lp-tpl-name" />
              <div className="a2-help a2-xs a2-mute">{c('t.saveHelp')}</div>
            </div>
            <button type="button" className="a2-btn a2-mt12" disabled={busy || !tplName.trim()} onClick={saveTemplate} data-testid="lp-tpl-save">
              {c('t.save')}
            </button>
            {tplSaid ? (
              <p className={`a2-sm lp-said ${tplSaid.bad ? 'bk-warn' : 'a2-mute'}`} role={tplSaid.bad ? 'alert' : 'status'} data-testid="lp-tpl-said">
                {tplSaid.text}
              </p>
            ) : null}
          </details>
        ) : null}
        {!p.canWrite ? <p className="a2-xs a2-mute">{c('b.readOnly')}</p> : null}
        {pg.id ? <p className="a2-xs a2-mute">{c('b.stateLine', { state: c(`state.${pg.state}`) })}</p> : null}
        {pg.id && pg.templateKey ? (
          <p className="a2-xs a2-mute" data-testid="lp-from">
            {c('t.from', { name: fromName })}
          </p>
        ) : null}
      </div>

      <div className="lp-stack">
        <section className="a2-card a2-sc" aria-labelledby={`${id}-pv`}>
          <h2 className="a2-h3" id={`${id}-pv`}>
            {c('b.preview')}
          </h2>
          <p className="a2-cs">{c('b.previewSub')}</p>
          <div className="lp-phone a2-mt12" aria-hidden="true" data-testid="lp-preview">
            <div className="lp-phs">
              {LANDING_SECTIONS.filter((k) => on[k]).map((k) =>
                k === 'hero' ? (
                  <div key={k} className="lp-ph-hero">
                    <b>{titleEn || product?.name || c('newTitle')}</b>
                    <span className="a2-xs">{offerEn || c('b.cod')}</span>
                  </div>
                ) : k === 'form' ? (
                  <div key={k} className="lp-ph-form">
                    {c('b.orderNow')}
                  </div>
                ) : (
                  <div key={k} className="lp-ph-part">
                    {c(`b.part.${k}`)}
                  </div>
                ),
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
