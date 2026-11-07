'use client';
// S02 · PR 598 — Products › Combos › Bag tier box (demo 89u-bag-offers.js "Bag offer tiers — take more, pay less"), in
// the Lumen look: the box's switch, first and last day, how many tiers it shows (up to 4) and the phone preview switch;
// then every Build-your-own-set rule with its state, what it covers, its days and its tiers and prices (read only:
// they are the rule's own, changed in Smart Rules with the owner's OK), a "show on the bag" switch and the owner's own
// words per tier; and a preview of the box as a computer and a phone show it. Save sends the box (PUT
// /api/admin/combos/bag-box, `combos.write`; the API checks again). Nothing here writes a price.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import type { BagBox } from '@/lib/website/bag-box-admin';

const API = '/api/admin/combos/bag-box';
// hardcode-ok: the setting's own bounds (bag.tiers.max 1–4; a tier's words up to 60 characters)
const MAX_TIERS = 4;
const WORDS_MAX = 60;

type Dict = { [k: string]: string | Dict };

/** One Build-your-own-set rule as this page shows it (from Smart Rules; prices already formatted). */
export interface BoxRule {
  key: string;
  name: string;
  state: string;
  covers: string;
  days: string;
  tiers: { quantity: number; price: string | null }[];
}

export function BagBoxEditor(p: { box: BagBox; version: string; rules: BoxRule[]; rulesHref: string; canEdit: boolean; lang: 'en' | 'bn'; w: Dict; locale?: string }) {
  // a37 browser check (follow-up 697): a tier's count in the admin's own digits, like the prices and counts beside it
  const nf = (n: number) => (p.locale ? n.toLocaleString(p.locale) : String(n));
  const router = useRouter();
  const uid = useId();
  const g = (k: string): string => {
    const v = k.split('.').reduce<string | Dict | undefined>((o, part) => (o && typeof o === 'object' ? o[part] : undefined), p.w);
    return typeof v === 'string' ? v : k;
  };
  const [box, setBox] = useState(p.box);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(box) !== JSON.stringify(p.box);
  const shown = (key: string) => !box.rules.hidden.includes(key);
  const setShown = (key: string, on: boolean) => setBox({ ...box, rules: { ...box.rules, hidden: on ? box.rules.hidden.filter((k) => k !== key) : [...box.rules.hidden, key] } });
  const wordsOf = (key: string, n: number) => box.rules.labels[`${key}:${n}`] ?? { en: '', bn: '' };
  const setWords = (key: string, n: number, lang: 'en' | 'bn', v: string) => {
    const labels = { ...box.rules.labels };
    const w = { ...wordsOf(key, n), [lang]: v.slice(0, WORDS_MAX) };
    if (!w.en.trim() && !w.bn.trim()) delete labels[`${key}:${n}`];
    else labels[`${key}:${n}`] = w;
    setBox({ ...box, rules: { ...box.rules, labels } });
  };
  const preview = p.rules.find((r) => shown(r.key) && r.tiers.some((t) => t.price !== null)) ?? null;
  const previewRows = preview ? preview.tiers.filter((t) => t.quantity >= 2 && t.price !== null).slice(0, box.max) : [];
  const rowText = (key: string, n: number) => {
    const w = wordsOf(key, n);
    return (p.lang === 'bn' && w.bn.trim()) || w.en.trim() || w.bn.trim() || g('pv.row').replace('{n}', nf(n));
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(API, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ box, version: p.version }) });
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
  const sw = (on: boolean, label: string, set: (v: boolean) => void, testid: string) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`lm-sw${on ? ' on' : ''}`} disabled={!p.canEdit} onClick={() => set(!on)} data-testid={testid}>
      <span aria-hidden="true" />
    </button>
  );

  return (
    <div className="bbx" data-testid="bb-editor">
      <section className="lm-setc" aria-labelledby={`${uid}-m`} data-testid="bb-master">
        <div className="lm-setr">
          <div>
            <h3 id={`${uid}-m`}>{g('master.title')}</h3>
            <p>{box.enabled ? g('master.on') : g('master.off')}</p>
          </div>
          {sw(box.enabled, g('master.title'), (v) => setBox({ ...box, enabled: v }), 'bb-master-sw')}
        </div>
        <div className="lm-fold">
          <div className="lm-fl">
            <label htmlFor={`${uid}-from`}>{g('f.from')}</label>
            <input id={`${uid}-from`} className="lm-inp" type="date" value={box.startsOn ?? ''} disabled={!p.canEdit} onChange={(e) => setBox({ ...box, startsOn: e.target.value || null })} />
          </div>
          <div className="lm-fl">
            <label htmlFor={`${uid}-to`}>{g('f.to')}</label>
            <input id={`${uid}-to`} className="lm-inp" type="date" value={box.endsOn ?? ''} min={box.startsOn ?? undefined} disabled={!p.canEdit} onChange={(e) => setBox({ ...box, endsOn: e.target.value || null })} />
          </div>
          <div className="lm-fl">
            <label htmlFor={`${uid}-max`}>{g('f.max')}</label>
            <select id={`${uid}-max`} className="lm-inp" value={box.max} disabled={!p.canEdit} onChange={(e) => setBox({ ...box, max: Number(e.target.value) })} data-testid="bb-max">
              {Array.from({ length: MAX_TIERS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {nf(n)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="lm-setr bbx-phone">
          <div>
            <h3 id={`${uid}-ph`}>{g('f.phone')}</h3>
            <p>{g('f.phoneHint')}</p>
          </div>
          {sw(box.phonePreview, g('f.phone'), (v) => setBox({ ...box, phonePreview: v }), 'bb-phone-sw')}
        </div>
      </section>

      <section className="lm-card bbx-card" aria-labelledby={`${uid}-r`}>
        <h2 id={`${uid}-r`}>{g('rules.title')}</h2>
        <p className="lm-sub">{g('rules.sub')}</p>
        {p.rules.length ? null : <p className="lm-hint" data-testid="bb-none">{g('rules.none')}</p>}
        <ul className="bbx-list">
          {p.rules.map((r) => (
            <li key={r.key} className="bbx-li">
              <div className={`bbx-row${shown(r.key) ? '' : ' off'}`} data-testid="bb-row" data-key={r.key}>
                <div className="bbx-name">
                  <b>{r.name}</b>
                  <span className="lm-hint">
                    <span className={`bbx-tag st-${r.state}`}>{g(`state.${r.state}`)}</span> {r.covers}
                    {r.days ? ` · ${r.days}` : ''}
                  </span>
                  <span className="bbx-tiers">
                    {r.tiers.map((t) => (
                      <span key={t.quantity} className="bbx-tier">
                        {g('tier').replace('{n}', nf(t.quantity))} · {t.price ?? g('notOffered')}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="bbx-acts">
                  {sw(shown(r.key), `${g('show')}: ${r.name}`, (v) => setShown(r.key, v), `bb-on-${r.key}`)}
                  {p.canEdit ? (
                    <button type="button" className="lm-btn sm" aria-expanded={open === r.key} onClick={() => setOpen(open === r.key ? null : r.key)} data-testid={`bb-words-${r.key}`}>
                      {g('words')}
                    </button>
                  ) : null}
                </div>
              </div>
              {open === r.key ? (
                <div className="lm-card bbx-form lm-in" role="group" aria-label={`${g('words')}: ${r.name}`}>
                  <p className="lm-hint">{g('wordsHint')}</p>
                  {r.tiers.slice(0, MAX_TIERS).map((t) => (
                    <fieldset key={t.quantity} className="bbx-words">
                      <legend>{g('tier').replace('{n}', nf(t.quantity))}</legend>
                      {(['en', 'bn'] as const).map((l) => (
                        <div className="lm-fl" key={l}>
                          <label htmlFor={`${uid}-${r.key}-${t.quantity}-${l}`}>{g(`f.${l}`)}</label>
                          <input id={`${uid}-${r.key}-${t.quantity}-${l}`} className="lm-inp" lang={l} maxLength={WORDS_MAX} placeholder={g('pv.row').replace('{n}', nf(t.quantity))} value={wordsOf(r.key, t.quantity)[l]} onChange={(e) => setWords(r.key, t.quantity, l, e.target.value)} />
                        </div>
                      ))}
                    </fieldset>
                  ))}
                  <div className="bbx-bar">
                    <button type="button" className="lm-btn pri" onClick={() => setOpen(null)}>
                      {g('done')}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <a className="lm-btn bbx-rules" href={p.rulesHref} data-testid="bb-rules-link">
          {g('rules.open')}
        </a>
      </section>

      <section className="lm-card bbx-card" aria-labelledby={`${uid}-p`} data-testid="bb-preview">
        <h2 id={`${uid}-p`}>{g('pv.title')}</h2>
        <p className="lm-sub">{preview ? g('pv.sub').replace('{name}', preview.name) : g('pv.none')}</p>
        {preview && previewRows.length ? (
          <div className="bbx-pvs">
            <figure className="bbx-fig">
              <figcaption className="lm-hint">{g('pv.desktop')}</figcaption>
              <div className="bbx-ladder">
                <b className="bbx-lt">{g('pv.head')}</b>
                {previewRows.map((t) => (
                  <div key={t.quantity} className="bbx-lr">
                    <span>{rowText(preview.key, t.quantity)}</span>
                    <b>{t.price}</b>
                  </div>
                ))}
                <span className="bbx-bars" aria-hidden="true">
                  <i />
                </span>
              </div>
            </figure>
            <figure className="bbx-fig bbx-figp">
              <figcaption className="lm-hint">{box.phonePreview ? g('pv.phoneFull') : g('pv.phone')}</figcaption>
              <div className="bbx-phoneline">
                <b>{rowText(preview.key, previewRows[0]!.quantity)}</b>
                <span>{previewRows[0]!.price}</span>
              </div>
            </figure>
          </div>
        ) : null}
        <p className="lm-hint">{g('pv.note')}</p>
      </section>

      {p.canEdit && (dirty || busy) ? (
        <div className="bbx-save">
          <p className="lm-hint" role="status">
            {g('unsaved')}
          </p>
          <div className="bbx-bar">
            <button type="button" className="lm-btn pri" disabled={busy || !dirty} onClick={() => void save()} data-testid="bb-save">
              {busy ? g('saving') : g('save')}
            </button>
            <button type="button" className="lm-btn" disabled={busy} onClick={() => (setBox(p.box), setOpen(null))}>
              {g('discard')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
