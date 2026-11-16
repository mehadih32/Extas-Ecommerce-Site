'use client';
// S28 · PR 1031 — wizard step 1, "Pick from ERP" (prototype v5): one product or a set (top + bottom), search the ERP's styles that are
// not on the shop yet, pick one and see what comes in from the ERP. "Next" brings the style in as a draft (the same import as
// Stock › Import from the ERP) and opens step 2; "Without ERP (rare)" makes an empty draft. Nothing reaches the shop.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ErpStylePreview } from '@extas/inventory';
import type { NewErpStyle } from '@extas/inventory';
import type { WizardData, WizardLists } from '@/lib/admin-wizard';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../../api';
import { erpImportErrorText } from '../ErpImport';
import { formatMoney, refusalText, type Money } from '../model';
import { say, sayBad } from '../useToast';
import { postSpec } from './api';
import type { Guard } from './ctx';
import { Callout, Fld, Seg, Tag } from '../wizard-ui';

export interface StepPickProps {
  d: Dict;
  money: Money;
  data: WizardData | null;
  lists: WizardLists;
  erp: { styles: NewErpStyle[]; truncated: boolean } | null;
  canWrite: boolean;
  /** Registers what "Next" does before it moves on (returns false to stay). */
  setGuard: (f: Guard | null) => void;
  saved: () => void;
}

export function StepPick(p: StepPickProps) {
  const { d, data } = p;
  const router = useRouter();
  const [kind, setKind] = useState<'SINGLE' | 'SET'>(data?.spec.kind ?? 'SINGLE');
  const [bottom, setBottom] = useState<string>(data?.spec.bottomProductId ?? '');
  const [q, setQ] = useState('');
  const [code, setCode] = useState<string>('');
  const [preview, setPreview] = useState<ErpStylePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hex = useMemo(() => new Map(p.lists.colours.map((c) => [c.nameEn.toLowerCase(), c.hex])), [p.lists.colours]);
  const styles = (p.erp?.styles ?? []).filter((s) => s.styleCode);
  const shown = styles.filter((s) => !q || (s.styleCode ?? '').toLowerCase().includes(q.toLowerCase()) || (s.styleName ?? '').toLowerCase().includes(q.toLowerCase()));
  const colourOf = (s: NewErpStyle) => [...new Set(s.skus.map((k) => k.color).filter((x): x is string => !!x))];

  // Picking a style reads what the import would bring (nothing is saved yet).
  const pick = async (styleCode: string) => {
    setCode(styleCode);
    setPreview(null);
    setErr('');
    const a = await call('GET', `/api/admin/inventory/erp/style?styleCode=${encodeURIComponent(styleCode)}`);
    if (a.status !== 200) return setErr(erpImportErrorText(d, a));
    setPreview(a.data.preview as ErpStylePreview);
  };

  const makeBlank = async () => {
    setBusy(true);
    const a = await call('POST', '/api/admin/catalogue/products', { nameEn: t(d, 'products.wiz.pick.blankName') });
    setBusy(false);
    if (a.status !== 201) return sayBad(refusalText(d, a.data.error, a.data.details));
    const id = (a.data.created as { id: string }).id;
    await postSpec(id, { kind, ...(kind === 'SET' && bottom ? { bottomProductId: bottom } : {}) });
    say(t(d, 'products.wiz.pick.blankMade'));
    router.push(`/admin/products/${id}?wizard=2`);
  };

  // What "Next" does: with a draft, keep the choices; without one, bring the picked style in.
  const next = async (): Promise<boolean> => {
    if (kind === 'SET' && !bottom) {
      sayBad(t(d, 'products.wiz.pick.needBottom'));
      return false;
    }
    if (data) {
      if (!p.canWrite) return true;
      const a = await postSpec(data.productId, { kind, bottomProductId: kind === 'SET' ? bottom || null : null });
      if (a.status !== 200) {
        sayBad(refusalText(d, a.data.error, a.data.details));
        return false;
      }
      p.saved();
      return true;
    }
    if (!code || !preview) {
      sayBad(t(d, 'products.wiz.pick.needStyle'));
      return false;
    }
    if (preview.blocking.length) {
      sayBad(t(d, 'products.wiz.pick.blocked'));
      return false;
    }
    setBusy(true);
    const a = await call('POST', '/api/admin/inventory/erp/style', { styleCode: code });
    setBusy(false);
    if (a.status !== 200) {
      sayBad(erpImportErrorText(d, a));
      return false;
    }
    const r = a.data.imported as { products: { grade: string; productId: string }[] };
    const main = r.products.find((x) => x.grade === 'A') ?? r.products[0];
    if (!main) return false;
    await postSpec(main.productId, { kind, ...(kind === 'SET' ? { bottomProductId: bottom, colourLink: 'SAME' } : {}) });
    say(t(d, 'products.wiz.pick.imported', { code }));
    router.push(`/admin/products/${main.productId}?wizard=2`);
    return false; // the page moves on by itself
  };
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });
  const { setGuard } = p;
  useEffect(() => {
    setGuard(() => nextRef.current());
    return () => setGuard(null);
  }, [setGuard]);

  const sw = (names: string[]) => (
    <span className="wzp-sw2" aria-hidden="true">
      {names.slice(0, 5).map((n) => (
        <i key={n} style={{ background: hex.get(n.toLowerCase()) ?? 'var(--lm-ln2)' }} />
      ))}
    </span>
  );

  const bottoms = p.lists.bottoms;
  const sizes = preview ? [...new Set(preview.lines.map((l) => l.size).filter((x): x is string => !!x))] : [];
  const colours = preview ? [...new Set(preview.lines.map((l) => l.colour).filter((x): x is string => !!x))] : [];
  const buying = preview?.showsBuyingPrice ? Math.max(0, ...preview.lines.map((l) => l.shopPriceMinor ?? 0)) : null;

  return (
    <>
      <Fld dict={d} label={t(d, 'products.wiz.pick.kind')}>
        <Seg
          label={t(d, 'products.wiz.pick.kind')}
          value={kind}
          options={[
            ['SINGLE', t(d, 'products.wiz.pick.single')],
            ['SET', t(d, 'products.wiz.pick.set')],
          ]}
          onChange={(v) => setKind(v)}
          disabled={!p.canWrite}
        />
      </Fld>
      {data ? (
        <div className="wzp-box" data-testid="wiz-brought">
          <div className="ad-mini" style={{ marginBottom: 6 }}>
            <b>{t(d, 'products.wiz.pick.brought')}</b> <Tag dict={d} kind="e" />
          </div>
          <div className="ad-mini">
            {t(d, 'products.wiz.pick.broughtLine', {
              code: data.erpStyleCode ?? '—',
              name: data.erpName,
              colours: data.colours.length,
              sizes: data.sizes.length,
              skus: data.variants,
              pieces: data.pieces,
            })}
            {data.costMinor !== null ? ` · ${t(d, 'products.wiz.pick.broughtCost', { cost: formatMoney(data.costMinor, p.money) })}` : ''}
          </div>
        </div>
      ) : (
        <>
          <Fld dict={d} label={t(d, 'products.wiz.pick.search')} tag="y" htmlFor="wz-q">
            <input id="wz-q" className="ad-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(d, 'products.wiz.pick.searchPh')} autoComplete="off" />
          </Fld>
          <div className="ad-mini" style={{ margin: '4px 0' }}>
            {t(d, 'products.wiz.pick.notOnShop', { n: styles.length })}
            {p.erp?.truncated ? ` · ${t(d, 'products.wiz.pick.truncated')}` : ''}
          </div>
          {p.erp === null ? <Callout kind="warn">{t(d, 'products.wiz.pick.noErp')}</Callout> : null}
          <div role="radiogroup" aria-label={t(d, 'products.wiz.pick.notOnShop', { n: styles.length })}>
            {shown.map((s) => {
              const names = colourOf(s);
              return (
                <label key={s.styleCode} className={`wzp-pick${code === s.styleCode ? ' on' : ''}`}>
                  <input type="radio" name="wz-style" checked={code === s.styleCode} onChange={() => void pick(s.styleCode!)} />
                  {sw(names)}
                  <div className="nm">
                    <b>{s.styleName ?? s.styleCode}</b>
                    <span className="ad-mini">
                      <span className="mono">{s.styleCode}</span> · {t(d, 'products.wiz.pick.styleMeta', { colours: names.length, skus: s.skus.length })}
                    </span>
                  </div>
                </label>
              );
            })}
            {!shown.length && p.erp !== null ? <p className="pa-empty">{t(d, 'products.wiz.pick.noMatch')}</p> : null}
          </div>
        </>
      )}
      {kind === 'SET' ? (
        <Fld dict={d} label={t(d, 'products.wiz.pick.bottom')} tag="y" htmlFor="wz-bot" hint={t(d, 'products.wiz.pick.bottomHint')}>
          <select id="wz-bot" className="ad-input" value={bottom} onChange={(e) => setBottom(e.target.value)} disabled={!p.canWrite}>
            <option value="">{t(d, 'products.wiz.pick.bottomPick')}</option>
            {bottoms.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.styleCode ? ` · ${b.styleCode}` : ''}
              </option>
            ))}
          </select>
        </Fld>
      ) : null}
      {err ? <Callout kind="bad">{err}</Callout> : null}
      {!data && preview ? (
        <div className="wzp-box" data-testid="wiz-brought">
          <div className="ad-mini" style={{ marginBottom: 6 }}>
            <b>{t(d, 'products.wiz.pick.brought')}</b> <Tag dict={d} kind="e" />
          </div>
          <div className="ad-mini">
            {t(d, 'products.wiz.pick.broughtLine', { code: preview.styleCode, name: preview.styleName ?? preview.styleCode, colours: colours.length, sizes: sizes.length, skus: preview.lines.filter((l) => l.action !== 'skip').length, pieces: '—' })}
            {buying !== null && buying > 0 ? ` · ${t(d, 'products.wiz.pick.broughtCost', { cost: formatMoney(buying, p.money) })}` : ''}
          </div>
          {preview.blocking.length ? (
            <div className="wzp-callout warn" style={{ marginTop: 8 }}>
              <span>{preview.blocking.map((b) => t(d, `products.wiz.pick.block.${b}`)).join(' ')}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {!data ? (
        <div className="ad-mini" style={{ marginTop: 10 }}>
          <button type="button" className="ad-btn ad-btn-ghost" onClick={() => void makeBlank()} disabled={busy || !p.canWrite}>
            {t(d, 'products.wiz.pick.without')}
          </button>{' '}
          <span>{t(d, 'products.wiz.pick.withoutHint')}</span>
        </div>
      ) : null}
    </>
  );
}
