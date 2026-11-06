'use client';
// S12 · PR 592 (Blueprint C11.5) — one house ad's editor (Website › Blog & journal › House ads › an ad), drawn in Lumen:
// the ad's fields with a live preview of how the journal draws it, Save (a new ad opens its own page, switched off);
// switch on / off and set aside / bring back (toast with Undo); its places — each with Change, Switch on / off and Set
// aside / Bring back — and the form that adds or changes a place. Everything goes to /api/admin/blog/ads, which checks
// it again (house-ads-model.ts) and answers which field is wrong. Nothing here touches a price, an offer or money.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import type { AdOptions, AdRow, PlaceRow } from '@/lib/journal/house-ads';
import { HOUSE_AD_KINDS, HOUSE_AD_SLOTS, NUMBERED_SLOTS, PLACE_SCOPES, POPUP_TRIGGERS, LIST_SLOTS, type HouseAdSlot } from '@/lib/journal/house-ads-model';

const API = '/api/admin/blog/ads';
type W = Record<string, string>;

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; id?: string; issues: string[] }> {
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { id?: string; details?: string[] };
    return { ok: r.ok, id: j.id, issues: Array.isArray(j.details) ? j.details : [] };
  } catch {
    return { ok: false, issues: [] };
  }
}

function Field(p: { id: string; label: string; hint?: string; bad?: boolean; children: React.ReactNode }) {
  return (
    <div className={`lm-fl${p.bad ? ' ha-fl-bad' : ''}`}>
      <label htmlFor={p.id}>{p.label}</label>
      {p.children}
      {p.hint ? <span className="lm-hint">{p.hint}</span> : null}
    </div>
  );
}

type AdVals = Record<'name' | 'kind' | 'target' | 'creativeAssetId' | 'weight' | 'startsOn' | 'endsOn' | 'headlineEn' | 'headlineBn' | 'textEn' | 'textBn' | 'ctaEn' | 'ctaBn', string>;

const adVals = (a: AdRow | null): AdVals => ({
  name: a?.name ?? '',
  kind: a?.kind ?? 'product',
  target: a?.target ?? '',
  creativeAssetId: a?.creativeAssetId ?? '',
  weight: String(a?.weight ?? 1),
  startsOn: a?.startsOn ?? '',
  endsOn: a?.endsOn ?? '',
  headlineEn: a?.headlineEn ?? '',
  headlineBn: a?.headlineBn ?? '',
  textEn: a?.textEn ?? '',
  textBn: a?.textBn ?? '',
  ctaEn: a?.ctaEn ?? '',
  ctaBn: a?.ctaBn ?? '',
});

/** Switch an ad or places on/off or aside/back, with the toast's Undo. */
interface Flip {
  (what: 'ad' | 'place', ids: string[], patch: { on?: boolean; aside?: boolean }, back: { on?: boolean; aside?: boolean }, done: string): Promise<void>;
}

type PlaceVals = Record<'slot' | 'scope' | 'blogCategoryId' | 'postId' | 'after' | 'trigger' | 'pct' | 'seconds' | 'capTimes' | 'capDays', string>;

export interface EditorProps {
  ad: AdRow | null;
  options: AdOptions;
  words: W;
  kinds: Record<string, string>;
  canWrite: boolean;
  /** A new popup's numbers (the card's). */
  defaults: { pct: number; seconds: number; capTimes: number; capDays: number };
}

export function HouseAdEditor({ ad, options, words: w, kinds, canWrite, defaults }: EditorProps) {
  const router = useRouter();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [v, setV] = useState<AdVals>(adVals(ad));
  const [bad, setBad] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof AdVals) => (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value, ...(k === 'kind' ? { target: '' } : {}) }));
  const ro = !canWrite;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const n = (s: string) => (s.trim() ? s : null);
    const r = await call({
      op: 'ad',
      ...(ad ? { id: ad.id } : {}),
      ad: { ...v, creativeAssetId: n(v.creativeAssetId), startsOn: n(v.startsOn), endsOn: n(v.endsOn), headlineBn: n(v.headlineBn), textEn: n(v.textEn), textBn: n(v.textBn), ctaEn: n(v.ctaEn), ctaBn: n(v.ctaBn) },
    });
    setBusy(false);
    setBad(r.ok ? [] : r.issues);
    showToast({ text: (r.ok ? (ad ? w.saved : w.created) : w.failed) ?? '', tone: r.ok ? 'ok' : 'bad' });
    if (r.ok && !ad && r.id) router.push(`/admin/website/blog/ads/${r.id}`);
    else if (r.ok) router.refresh();
  };

  const flip = async (what: 'ad' | 'place', ids: string[], patch: { on?: boolean; aside?: boolean }, back: { on?: boolean; aside?: boolean }, done: string) => {
    const r = await call({ op: 'switch', what, ids, ...patch });
    showToast({
      text: (r.ok ? done : w.failed) ?? '',
      tone: r.ok ? 'ok' : 'bad',
      undo: r.ok
        ? {
            kind: patch.aside === undefined ? (patch.on ? 'show' : 'hide') : patch.aside ? 'archive' : 'unarchive',
            run: async () => {
              const u = await call({ op: 'switch', what, ids, ...back });
              router.refresh();
              return u.ok;
            },
          }
        : undefined,
    });
    if (r.ok) router.refresh();
  };

  const listed = v.kind === 'product' ? options.products : v.kind === 'combo' ? options.combos : v.kind === 'category' ? options.categories : [];
  // the ad's own target stays choosable even when it is no longer live (it then shows nothing in the shop)
  const targetOptions = ad && ad.kind === v.kind && ad.target && !listed.some((o) => o.id === ad.target) ? [{ id: ad.target, name: ad.targetName ?? ad.target }, ...listed] : listed;
  const f = (k: keyof AdVals) => `${uid}-${k}`;
  const isBad = (k: string) => bad.includes(k);
  const text = (k: keyof AdVals, max: number, hint?: string, area = false) => (
    <Field id={f(k)} label={w[k]!} hint={hint} bad={isBad(k)}>
      {area ? (
        <textarea id={f(k)} className="lm-inp" value={v[k]} onChange={set(k)} maxLength={max} disabled={ro} rows={2} />
      ) : (
        <input id={f(k)} className="lm-inp" value={v[k]} onChange={set(k)} maxLength={max} disabled={ro} />
      )}
    </Field>
  );

  return (
    <div className="ha-grid">
      <div className="ha-stack">
        <section className="lm-card ha-form" aria-labelledby={`${uid}-h`} data-testid="ha-e-form">
          <h2 className="lm-h2" id={`${uid}-h`}>
            {w.ad}
          </h2>
          {text('name', 80)}
          <div className="ha-two">
            <Field id={f('kind')} label={w.kind!}>
              <select id={f('kind')} className="lm-inp" value={v.kind} onChange={set('kind')} disabled={ro}>
                {HOUSE_AD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kinds[k]}
                  </option>
                ))}
              </select>
            </Field>
            {v.kind === 'banner' ? (
              <Field id={f('target')} label={w.targetBanner!} hint={w.targetHint} bad={isBad('target')}>
                <input id={f('target')} className="lm-inp" value={v.target} onChange={set('target')} maxLength={300} placeholder="/" disabled={ro} />
              </Field>
            ) : (
              <Field id={f('target')} label={w.target!} bad={isBad('target')}>
                <select id={f('target')} className="lm-inp" value={v.target} onChange={set('target')} disabled={ro}>
                  <option value="">{w.pick}</option>
                  {targetOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Field id={f('creativeAssetId')} label={w.picture!} hint={w.pictureHint} bad={isBad('creativeAssetId')}>
            <select id={f('creativeAssetId')} className="lm-inp" value={v.creativeAssetId} onChange={set('creativeAssetId')} disabled={ro}>
              <option value="">{w.noPicture}</option>
              {options.pictures.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="ha-two">
            {text('headlineEn', 90)}
            {text('headlineBn', 90, w.bnHint)}
            {text('textEn', 220, undefined, true)}
            {text('textBn', 220, w.bnHint, true)}
            {text('ctaEn', 30, w.ctaHint)}
            {text('ctaBn', 30, w.bnHint)}
          </div>
          <div className="ha-two">
            <Field id={f('startsOn')} label={w.startsOn!} hint={w.datesHint} bad={isBad('startsOn')}>
              <input id={f('startsOn')} type="date" className="lm-inp" value={v.startsOn} onChange={set('startsOn')} disabled={ro} />
            </Field>
            <Field id={f('endsOn')} label={w.endsOn!} bad={isBad('endsOn')}>
              <input id={f('endsOn')} type="date" className="lm-inp" value={v.endsOn} onChange={set('endsOn')} disabled={ro} />
            </Field>
          </div>
          <Field id={f('weight')} label={w.weight!} hint={w.weightHint} bad={isBad('weight')}>
            <input id={f('weight')} type="number" inputMode="numeric" min={1} max={100} className="lm-inp" value={v.weight} onChange={set('weight')} disabled={ro} />
          </Field>
          {canWrite ? (
            <div className="ha-acts">
              <button type="button" className="lm-btn pri" onClick={save} disabled={busy} aria-busy={busy} data-testid="ha-e-save">
                {w.save}
              </button>
            </div>
          ) : null}
        </section>
        {ad ? <Places ad={ad} options={options} w={w} canWrite={canWrite} defaults={defaults} flip={flip} /> : <p className="lm-card ha-ro">{w.saveFirst}</p>}
      </div>
      <div className="ha-stack">
        <section className="lm-card" aria-labelledby={`${uid}-pv`} data-testid="ha-e-preview">
          <h2 className="lm-h2" id={`${uid}-pv`}>
            {w.preview}
          </h2>
          <div className="ha-pv">
            <span className="ha-pv-l">{w.label}</span>
            <span className="ha-pv-t">{v.headlineEn || v.name || '—'}</span>
            {v.textEn ? <span className="ha-pv-x">{v.textEn}</span> : null}
            <span className="ha-pv-b">{v.ctaEn || w.go}</span>
          </div>
          {v.headlineBn || v.textBn ? (
            <div className="ha-pv" lang="bn">
              <span className="ha-pv-t">{v.headlineBn || v.headlineEn}</span>
              {v.textBn ? <span className="ha-pv-x">{v.textBn}</span> : null}
            </div>
          ) : null}
        </section>
        {ad && canWrite ? (
          <section className="lm-card ha-form" aria-labelledby={`${uid}-st`} data-testid="ha-e-state">
            <h2 className="lm-h2" id={`${uid}-st`}>
              {w.state}
            </h2>
            <div className="ha-acts">
              {ad.state === 'aside' ? null : ad.enabled ? (
                <button type="button" className="lm-btn" onClick={() => flip('ad', [ad.id], { on: false }, { on: true }, w.offDone!)}>
                  {w.switchOff}
                </button>
              ) : (
                <button type="button" className="lm-btn pri" onClick={() => flip('ad', [ad.id], { on: true }, { on: false }, w.onDone!)} data-testid="ha-e-on">
                  {w.switchOn}
                </button>
              )}
              {ad.state === 'aside' ? (
                <button type="button" className="lm-btn" onClick={() => flip('ad', [ad.id], { aside: false }, { aside: true }, w.backDone!)}>
                  {w.backBtn}
                </button>
              ) : (
                <button type="button" className="lm-btn gh" onClick={() => flip('ad', [ad.id], { aside: true }, { aside: false }, w.asideDone!)}>
                  {w.asideBtn}
                </button>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function placeVals(p: PlaceRow | null, d: EditorProps['defaults']): PlaceVals {
  return {
    slot: p?.slot ?? 'end',
    scope: p?.scope ?? 'all',
    blogCategoryId: p?.blogCategoryId ?? '',
    postId: p?.postId ?? '',
    after: String(p?.after ?? 2),
    trigger: p?.popup?.trigger.kind ?? (d.seconds > 0 ? 'time' : 'scroll'),
    pct: String(p?.popup?.trigger.pct ?? d.pct),
    seconds: String(p?.popup?.trigger.seconds ?? d.seconds),
    capTimes: String(p?.popup?.cap.times ?? d.capTimes),
    capDays: String(p?.popup?.cap.days ?? d.capDays),
  };
}

function Places(props: {
  ad: AdRow;
  options: AdOptions;
  w: W;
  canWrite: boolean;
  defaults: EditorProps['defaults'];
  flip: Flip;
}) {
  const { ad, options, w, canWrite, defaults, flip } = props;
  const router = useRouter();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [editing, setEditing] = useState<string | null>(null);
  const [v, setV] = useState<PlaceVals>(placeVals(null, defaults));
  const [bad, setBad] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof PlaceVals) => (e: { target: { value: string } }) =>
    // a list page's place is never for one article
    setV((o) => ({ ...o, [k]: e.target.value, ...(k === 'slot' && o.scope === 'post' && LIST_SLOTS.includes(e.target.value as HouseAdSlot) ? { scope: 'all' } : {}) }));
  const open = (p: PlaceRow | null) => {
    setEditing(p ? p.id : 'new');
    setV(placeVals(p, defaults));
    setBad([]);
  };
  const slot = v.slot as HouseAdSlot;
  const numbered = NUMBERED_SLOTS.includes(slot);
  const save = async () => {
    if (busy || !editing) return;
    setBusy(true);
    const popup = slot === 'popup';
    const r = await call({
      op: 'place',
      adId: ad.id,
      ...(editing !== 'new' ? { id: editing } : {}),
      place: {
        slot: v.slot,
        scope: v.scope,
        blogCategoryId: v.scope === 'category' ? v.blogCategoryId || null : null,
        postId: v.scope === 'post' ? v.postId || null : null,
        after: numbered ? v.after : null,
        trigger: popup ? v.trigger : null,
        pct: popup ? v.pct : null,
        seconds: popup ? v.seconds : null,
        capTimes: popup ? v.capTimes : null,
        capDays: popup ? v.capDays : null,
      },
    });
    setBusy(false);
    setBad(r.ok ? [] : r.issues);
    showToast({ text: (r.ok ? (editing === 'new' ? w.placeAdded : w.placeSaved) : w.failed) ?? '', tone: r.ok ? 'ok' : 'bad' });
    if (r.ok) {
      setEditing(null);
      router.refresh();
    }
  };
  const f = (k: string) => `${uid}-${k}`;
  const summary = (p: PlaceRow) => {
    const bits = [w[`slot_${p.slot}`]];
    bits.push(p.scope === 'post' ? `${w.post}: ${p.post?.title ?? '—'}` : p.scope === 'category' ? `${w.topic}: ${p.category ?? '—'}` : w.scope_all);
    if (p.after) bits.push(`${p.slot === 'inline' ? w.after : w.afterCard} ${p.after}`);
    if (p.popup) bits.push((w.popupSum ?? '').replace('{trigger}', w[`trigger_${p.popup.trigger.kind}`] ?? '').replace('{times}', String(p.popup.cap.times)).replace('{days}', String(p.popup.cap.days)));
    return bits;
  };
  const scopes = PLACE_SCOPES.filter((s) => !(s === 'post' && LIST_SLOTS.includes(slot)));

  return (
    <section className="lm-card ha-form" aria-labelledby={`${uid}-h`} data-testid="ha-e-places">
      <h2 className="lm-h2" id={`${uid}-h`}>
        {w.places}
      </h2>
      <p className="lm-hint">{w.placesSub}</p>
      {ad.places.length ? (
        <ul className="ha-places">
          {ad.places.map((p) => (
            <li key={p.id} className="ha-place" data-testid="ha-e-place">
              <span className="ha-place-h">
                <span>{w[`slot_${p.slot}`]}</span>
                <span className={`ha-pill${p.aside ? '' : p.enabled ? ' ok' : ''}`}>{p.aside ? w.pAside : p.enabled ? w.pOn : w.pOff}</span>
              </span>
              <span className="ha-meta">
                {summary(p)
                  .slice(1)
                  .map((b, i) => (
                    <span key={i}>{b}</span>
                  ))}
              </span>
              {canWrite ? (
                <span className="ha-acts">
                  {p.aside ? null : (
                    <button type="button" className="lm-btn sm" onClick={() => open(p)}>
                      {w.edit}
                    </button>
                  )}
                  {p.aside ? null : p.enabled ? (
                    <button type="button" className="lm-btn sm" onClick={() => flip('place', [p.id], { on: false }, { on: true }, w.placeOffDone!)}>
                      {w.placeOff}
                    </button>
                  ) : (
                    <button type="button" className="lm-btn sm pri" onClick={() => flip('place', [p.id], { on: true }, { on: false }, w.placeOnDone!)}>
                      {w.placeOn}
                    </button>
                  )}
                  {p.aside ? (
                    <button type="button" className="lm-btn sm" onClick={() => flip('place', [p.id], { aside: false }, { aside: true }, w.placeBackDone!)}>
                      {w.placeBack}
                    </button>
                  ) : (
                    <button type="button" className="lm-btn sm gh" onClick={() => flip('place', [p.id], { aside: true }, { aside: false }, w.placeAsideDone!)}>
                      {w.placeAside}
                    </button>
                  )}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="lm-hint">{w.noPlaces}</p>
      )}
      {canWrite && !editing ? (
        <div className="ha-acts">
          <button type="button" className="lm-btn" onClick={() => open(null)} data-testid="ha-e-add">
            {w.addPlace}
          </button>
        </div>
      ) : null}
      {canWrite && editing ? (
        <div className="ha-form" data-testid="ha-e-placeform">
          <h3 className="lm-h2">{editing === 'new' ? w.addPlace : w.editPlace}</h3>
          <div className="ha-two">
            <Field id={f('slot')} label={w.slot!}>
              <select id={f('slot')} className="lm-inp" value={v.slot} onChange={set('slot')}>
                {HOUSE_AD_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {w[`slot_${s}`]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={f('scope')} label={w.scope!} bad={bad.includes('scope')}>
              <select id={f('scope')} className="lm-inp" value={v.scope} onChange={set('scope')}>
                {scopes.map((s) => (
                  <option key={s} value={s}>
                    {w[`scope_${s}`]}
                  </option>
                ))}
              </select>
            </Field>
            {v.scope === 'category' ? (
              <Field id={f('cat')} label={w.topic!} bad={bad.includes('blogCategoryId')}>
                <select id={f('cat')} className="lm-inp" value={v.blogCategoryId} onChange={set('blogCategoryId')}>
                  <option value="">{w.pick}</option>
                  {options.topics.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {v.scope === 'post' && !LIST_SLOTS.includes(slot) ? (
              <Field id={f('post')} label={w.post!} bad={bad.includes('postId')}>
                <select id={f('post')} className="lm-inp" value={v.postId} onChange={set('postId')}>
                  <option value="">{w.pick}</option>
                  {options.posts.map((o) => (
                    <option key={o.id} value={o.id} lang={o.locale}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {numbered ? (
              <Field id={f('after')} label={slot === 'inline' ? w.after! : w.afterCard!} hint={slot === 'inline' ? w.afterHint : undefined} bad={bad.includes('after')}>
                <input id={f('after')} type="number" inputMode="numeric" min={1} max={40} className="lm-inp" value={v.after} onChange={set('after')} />
              </Field>
            ) : null}
            {slot === 'popup' ? (
              <>
                <Field id={f('trigger')} label={w.trigger!}>
                  <select id={f('trigger')} className="lm-inp" value={v.trigger} onChange={set('trigger')}>
                    {POPUP_TRIGGERS.map((x) => (
                      <option key={x} value={x}>
                        {w[`trigger_${x}`]}
                      </option>
                    ))}
                  </select>
                </Field>
                {v.trigger === 'scroll' ? (
                  <Field id={f('pct')} label={w.pct!} bad={bad.includes('pct')}>
                    <span className="lm-inp-w">
                      <input id={f('pct')} type="number" inputMode="numeric" min={10} max={95} className="lm-inp" value={v.pct} onChange={set('pct')} />
                      <span className="lm-unit">%</span>
                    </span>
                  </Field>
                ) : null}
                {v.trigger === 'time' ? (
                  <Field id={f('seconds')} label={w.seconds!} bad={bad.includes('seconds')}>
                    <input id={f('seconds')} type="number" inputMode="numeric" min={0} max={600} className="lm-inp" value={v.seconds} onChange={set('seconds')} />
                  </Field>
                ) : null}
                <Field id={f('capTimes')} label={w.capTimes!} bad={bad.includes('capTimes')}>
                  <input id={f('capTimes')} type="number" inputMode="numeric" min={1} max={20} className="lm-inp" value={v.capTimes} onChange={set('capTimes')} />
                </Field>
                <Field id={f('capDays')} label={w.capDays!} bad={bad.includes('capDays')}>
                  <input id={f('capDays')} type="number" inputMode="numeric" min={1} max={90} className="lm-inp" value={v.capDays} onChange={set('capDays')} />
                </Field>
              </>
            ) : null}
          </div>
          <div className="ha-acts">
            <button type="button" className="lm-btn pri" onClick={save} disabled={busy} aria-busy={busy} data-testid="ha-e-saveplace">
              {w.savePlace}
            </button>
            <button type="button" className="lm-btn gh" onClick={() => setEditing(null)}>
              {w.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

