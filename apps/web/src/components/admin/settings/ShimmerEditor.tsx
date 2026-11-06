'use client';
// S02 · PR 598 — Settings › Shimmer (demo 89t-shimmer.js "Shimmer / ঝিলিক"), in the Lumen look: the master switch, then
// every shimmer of the shop in one list with its own switch, speed (slow / as designed / fast) and strength (as designed
// / medium / soft, never brighter than designed), a link to where it shows, and under "More options" the four factors.
// The Add to Bag shimmer is off as designed; a visitor whose device asks for less motion never sees any shimmer. Save
// sends everything at once (PUT /api/admin/settings/shimmer, `settings.write`; the API checks again).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { Shimmer, ShimmerSpeed, ShimmerStrength, ShopShimmerSettings, ShopSweep, ShopSweepSettings } from '@extas/settings';
import { showToast } from '@/components/admin/lumen/Toast';
import { ROUTES } from '@/lib/shop/routes';
import type { PdpSweep } from '@/lib/website/shimmer-admin';

const API = '/api/admin/settings/shimmer';
/** The demo's order (SHIM_ITEMS) and where each one shows (null: a product page). */
const ROWS: readonly { id: Shimmer; see: string | null }[] = [
  { id: 'checkout', see: ROUTES.bag },
  { id: 'continueShopping', see: ROUTES.bag },
  { id: 'freeLabel', see: ROUTES.bag },
  { id: 'addToBag', see: null },
  { id: 'orderNow', see: null },
  { id: 'buttons', see: ROUTES.home },
  { id: 'logo', see: ROUTES.home },
  { id: 'pdpWords', see: null },
  { id: 'pdpPills', see: null },
  { id: 'checkoutHelp', see: ROUTES.checkout },
  { id: 'checkoutNeed', see: ROUTES.checkout },
  { id: 'accountOffer', see: ROUTES.account },
  { id: 'announce', see: ROUTES.home },
  { id: 'footerPay', see: ROUTES.home },
];
/** The settings' own choices (registry-shimmer.ts), kept here so the page does not load the registry. */
const SPEEDS: readonly ShimmerSpeed[] = ['slow', 'normal', 'fast'];
const STRENGTHS: readonly ShimmerStrength[] = ['full', 'medium', 'soft'];
const WORDS = ['freeDelivery', 'stock', 'allColours', 'colourLabel', 'sizeLabel'] as const;

type Dict = { [k: string]: string | Dict };

export function ShimmerEditor(p: { sweep: ShopSweepSettings; pdp: PdpSweep; tune: ShopShimmerSettings; version: string; canEdit: boolean; w: Dict }) {
  const router = useRouter();
  const uid = useId();
  const g = (k: string): string => {
    const v = k.split('.').reduce<string | Dict | undefined>((o, part) => (o && typeof o === 'object' ? o[part] : undefined), p.w);
    return typeof v === 'string' ? v : k;
  };
  const [sweep, setSweep] = useState(p.sweep);
  const [pdp, setPdp] = useState(p.pdp);
  const [tune, setTune] = useState(p.tune);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify([sweep, pdp, tune]) !== JSON.stringify([p.sweep, p.pdp, p.tune]);

  const isOn = (id: Shimmer): boolean => (id === 'pdpWords' ? WORDS.every((k) => pdp[k]) : id === 'pdpPills' ? pdp.sizePills : sweep.items[id as ShopSweep]);
  const setOn = (id: Shimmer, on: boolean) => {
    if (id === 'pdpWords') setPdp({ ...pdp, ...Object.fromEntries(WORDS.map((k) => [k, on])) });
    else if (id === 'pdpPills') setPdp({ ...pdp, sizePills: on });
    else setSweep({ ...sweep, items: { ...sweep.items, [id]: on } });
  };
  const tuneOf = (id: Shimmer) => tune.items[id] ?? { speed: 'normal' as const, strength: 'full' as const };
  const setTuneOf = (id: Shimmer, q: Partial<{ speed: ShimmerSpeed; strength: ShimmerStrength }>) => {
    const v = { ...tuneOf(id), ...q };
    const items = { ...tune.items };
    if (v.speed === 'normal' && v.strength === 'full') delete items[id];
    else items[id] = v;
    setTune({ ...tune, items });
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(API, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sweep, pdp, tune, version: p.version }) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string };
      if (data.ok) {
        showToast({ text: g('saved'), tone: 'ok' });
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

  const select = (label: string, value: string, opts: readonly string[], ns: string, set: (v: string) => void, id: string, disabled: boolean) => (
    <div className="lm-fl shx-sel" key={id}>
      <label htmlFor={`${uid}-${id}`}>{label}</label>
      <select id={`${uid}-${id}`} className="lm-inp" value={value} disabled={disabled} onChange={(e) => set(e.target.value)} data-testid={`sh-${id}`}>
        {opts.map((v) => (
          <option key={v} value={v}>
            {g(`${ns}.${v}`)}
          </option>
        ))}
      </select>
    </div>
  );
  const factor = (k: 'slow' | 'fast' | 'medium' | 'soft', min: number, max: number) => (
    <div className="lm-fl" key={k}>
      <label htmlFor={`${uid}-f-${k}`}>{g(`more.${k}`)}</label>
      <input id={`${uid}-f-${k}`} className="lm-inp" type="number" inputMode="decimal" step={0.05} min={min} max={max} value={tune[k]} disabled={!p.canEdit} onChange={(e) => setTune({ ...tune, [k]: Math.min(max, Math.max(min, Math.round((Number(e.target.value) || min) * 100) / 100)) })} />
    </div>
  );

  return (
    <div className="shx" data-testid="sh-editor">
      <section className="lm-setc" aria-labelledby={`${uid}-m`} data-testid="sh-master">
        <div className="lm-setr">
          <div>
            <h3 id={`${uid}-m`}>{g('master.title')}</h3>
            <p>{sweep.on ? g('master.on') : g('master.off')}</p>
          </div>
          <button type="button" role="switch" aria-checked={sweep.on} aria-labelledby={`${uid}-m`} className={`lm-sw${sweep.on ? ' on' : ''}`} disabled={!p.canEdit} onClick={() => setSweep({ ...sweep, on: !sweep.on })} data-testid="sh-master-sw">
            <span aria-hidden="true" />
          </button>
        </div>
        <p className="lm-hint">{g('master.motion')}</p>
      </section>

      <section className="lm-card shx-card" aria-labelledby={`${uid}-l`}>
        <h2 id={`${uid}-l`}>{g('list.title')}</h2>
        <p className="lm-sub">{g('list.sub')}</p>
        <ul className="shx-list">
          {ROWS.map(({ id, see }) => {
            const on = isOn(id);
            const tn = tuneOf(id);
            const off = !p.canEdit || !on || !sweep.on;
            return (
              <li key={id} className={`shx-row${on && sweep.on ? '' : ' off'}`} data-testid="sh-row" data-id={id}>
                <div className="shx-name">
                  <b>{g(`item.${id}`)}</b>
                  <span className="lm-hint">
                    {g(`where.${id}`)}
                    {id === 'addToBag' ? ` · ${g('offByDesign')}` : null}
                    {see ? (
                      <>
                        {' · '}
                        <a href={see} target="_blank" rel="noopener" className="shx-see">
                          {g('see')}
                        </a>
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="shx-ctl">
                  <button type="button" role="switch" aria-checked={on} aria-label={`${g('show')}: ${g(`item.${id}`)}`} className={`lm-sw${on ? ' on' : ''}`} disabled={!p.canEdit} onClick={() => setOn(id, !on)} data-testid={`sh-on-${id}`}>
                    <span aria-hidden="true" />
                  </button>
                  {select(g('speed'), tn.speed, SPEEDS, 'speedOpt', (v) => setTuneOf(id, { speed: v as typeof tn.speed }), `${id}-speed`, off)}
                  {select(g('strength'), tn.strength, STRENGTHS, 'strengthOpt', (v) => setTuneOf(id, { strength: v as typeof tn.strength }), `${id}-strength`, off)}
                </div>
              </li>
            );
          })}
        </ul>
        <details className="a2-more-opts shx-more" data-testid="sh-more">
          <summary>{g('more.title')}</summary>
          <p className="lm-hint">{g('more.sub')}</p>
          <div className="lm-fold">
            {factor('slow', 1.05, 3)}
            {factor('fast', 0.3, 0.95)}
            {factor('medium', 0.3, 0.95)}
            {factor('soft', 0.1, Math.min(0.9, tune.medium))}
          </div>
          {p.canEdit ? (
            <button type="button" className="lm-btn gh" disabled={busy} onClick={() => setTune({ ...tune, items: {} })} data-testid="sh-reset">
              {g('reset')}
            </button>
          ) : null}
        </details>
      </section>

      {p.canEdit && (dirty || busy) ? (
        <div className="shx-save">
          <p className="lm-hint" role="status">
            {g('unsaved')}
          </p>
          <div className="shx-bar">
            <button type="button" className="lm-btn pri" disabled={busy || !dirty} onClick={() => void save()} data-testid="sh-save">
              {busy ? g('saving') : g('save')}
            </button>
            <button type="button" className="lm-btn" disabled={busy} onClick={() => (setSweep(p.sweep), setPdp(p.pdp), setTune(p.tune))}>
              {g('discard')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
