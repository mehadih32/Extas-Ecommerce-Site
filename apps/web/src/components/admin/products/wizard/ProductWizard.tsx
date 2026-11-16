'use client';
// S28 · PR 1031 — the add-product wizard (prototype v5, "Add product"): eight steps in one card with the shopper's phone beside it. The
// head has "Quick import" and "Start again", a line "n of 8 steps done · Left: …" with a bar, the eight step pills, the step's body and
// "Back" / "Next". Every step saves by itself into the draft (a product that is not on the shop yet); nothing reaches the shop or a
// customer before step 8's "Publish now" or "Publish at …".
import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canPublish, stepFlags } from '@extas/catalogue/wizard-model';
import type { NewErpStyle } from '@extas/inventory';
import type { WizardData, WizardLists } from '@/lib/admin-wizard';
import { t, type Dict } from '@/lib/i18n';
import { call, type Answer } from '../../api';
import type { Lang, Money } from '../model';
import { refusalText } from '../model';
import { say, sayBad } from '../useToast';
import { Callout, Modal } from '../wizard-ui';
import { PLACE_WORDS } from '../seo-score';
import { patchProduct, rememberStep } from './api';
import type { Can, Ctx, Guard, Live, PhotoProps } from './ctx';
import { StepColours } from './StepColours';
import { StepGoogle } from './StepGoogle';
import { StepName } from './StepName';
import { StepPhotos } from './StepPhotos';
import { StepPick } from './StepPick';
import { StepPrice } from './StepPrice';
import { StepPublish } from './StepPublish';
import { StepText } from './StepText';
import { WizardPhone } from './WizardPhone';
import '../wizard-steps.css';

const KEYS = ['start', 'basics', 'colours', 'photos', 'prices', 'size', 'search', 'publish'] as const;


export interface ProductWizardProps {
  d: Dict;
  lang: Lang;
  money: Money;
  step: number;
  data: WizardData | null;
  lists: WizardLists;
  erp: { styles: NewErpStyle[]; truncated: boolean } | null;
  can: Can;
  requirePin: boolean;
  ownBrandId: string | null;
  photos: PhotoProps;
  demoCount: number;
  settingsHref: string;
  listHref: string;
  resume: { productId: string; name: string | null; step: number }[];
}

export function ProductWizard(p: ProductWizardProps) {
  const { d, data, step } = p;
  const router = useRouter();
  const guard = useRef<Guard | null>(null);
  const setGuard = useCallback((f: Guard | null) => {
    guard.current = f;
  }, []);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  const [quick, setQuick] = useState(false);
  const [live, setLiveState] = useState<Live>(() => ({
    name: data?.nameEn ?? '',
    brandId: data?.brandId ?? null,
    priceMinor: data?.priceMinor ?? null,
    compareAtMinor: data?.compareAtMinor ?? null,
    keyPoints: data?.spec.keyPoints ?? '',
    modelHeight: data?.spec.modelHeight ?? '',
    modelWeightKg: data?.spec.modelWeightKg == null ? '' : String(data.spec.modelWeightKg),
    modelWears: data?.spec.modelWears ?? '',
    colourNames: data?.colourNames ?? {},
    hiddenColourIds: data?.spec.hiddenColourIds ?? [],
    hiddenSizeIds: data?.spec.hiddenSizeIds ?? [],
    photos: Object.fromEntries((data?.colours ?? []).map((x) => [x.id, x.photos])),
    front: Object.fromEntries((data?.colours ?? []).map((x) => [x.id, x.front])),
    description: data?.descriptionEn ?? '',
    slug: data?.slug ?? '',
    title: data?.seoTitleEn ?? '',
    metaDescription: data?.metaDescriptionEn ?? '',
    keyword: data?.focusKeyword ?? '',
    confirmed: !!data?.spec.priceConfirmedAt && data?.priceMinor != null,
    setKind: data?.spec.kind ?? 'SINGLE',
    bottomId: data?.spec.bottomProductId ?? null,
    categoryId: data?.categoryId ?? null,
    forWho: data?.spec.forWho ?? null,
  }));
  const setLive = useCallback((x: Partial<Live>) => setLiveState((o) => ({ ...o, ...x })), []);
  const saved = useCallback(() => setSavedAt(Date.now()), []);
  const refuse = useCallback((a: Answer) => sayBad(refusalText(d, a.data.error, a.data.details)), [d]);
  const refresh = useCallback(() => router.refresh(), [router]);

  const href = (n: number) => (data ? `/admin/products/${data.productId}?wizard=${n}` : '/admin/products/new');
  const flags = useMemo(() => {
    const kept = (data?.colours ?? []).filter((x) => !live.hiddenColourIds.includes(x.id));
    return stepFlags({
      name: live.name,
      hasCategory: !!live.categoryId,
      colours: kept.length,
      coloursWithoutFront: kept.filter((x) => !x.front).length,
      priceMinor: live.priceMinor ?? 0,
      costMinor: data?.costMinor ?? 0,
      priceConfirmed: live.confirmed,
      description: live.description,
      hasGoogleText: !!live.title.trim() && !!live.metaDescription.trim(),
      kind: live.setKind,
      hasBottom: !!live.bottomId,
      hasStyle: !!data,
    });
  }, [live, data]);
  const doneN = flags.slice(0, 7).filter((f) => f.ok).length + (flags[7]?.ok ? 1 : 0);
  const left = KEYS.map((k, i) => (flags[i]?.ok || i === 7 ? null : t(d, `products.wiz.s.${k}.name`))).filter((x): x is string => !!x);
  const publishable = !!data && canPublish({ name: live.name, hasCategory: !!live.categoryId, colours: (data.colours ?? []).filter((x) => !live.hiddenColourIds.includes(x.id)).length, coloursWithoutFront: (data.colours ?? []).filter((x) => !live.hiddenColourIds.includes(x.id) && !x.front).length, priceMinor: live.priceMinor ?? 0, costMinor: data.costMinor ?? 0, priceConfirmed: live.confirmed, description: live.description, hasGoogleText: true, kind: live.setKind, hasBottom: !!live.bottomId, hasStyle: true });

  const go = async (n: number) => {
    if (n === step || n < 1 || n > 8) return;
    if (!data) return sayBad(t(d, 'products.wiz.pickFirst'));
    setBusy(true);
    try {
      if (n > step && guard.current && !(await guard.current())) return;
      if (p.can.write && n >= 2) {
        const a = await rememberStep(data.productId, n);
        if (a.status !== 200) return sayBad(refusalText(d, a.data.error, a.data.details));
      }
      router.push(href(n));
    } finally {
      setBusy(false);
    }
  };
  const next = async () => {
    setBusy(true);
    try {
      if (guard.current && !(await guard.current())) return;
      if (data && step === 1) {
        // step 1 on a draft: the guard already kept the choices
        router.push(href(2));
        if (p.can.write) void rememberStep(data.productId, 2);
      } else if (data && step < 8) {
        if (p.can.write) await rememberStep(data.productId, step + 1);
        router.push(href(step + 1));
      }
    } finally {
      setBusy(false);
    }
  };

  const ctx: Ctx | null = data
    ? { d, lang: p.lang, money: p.money, data, lists: p.lists, can: p.can, requirePin: p.requirePin, ownBrandId: p.ownBrandId, live, setLive, saved, refuse, refresh, go: (n) => void go(n), photos: p.photos, place: PLACE_WORDS, demoCount: p.demoCount, settingsHref: p.settingsHref }
    : null;

  const startAgain = async () => {
    if (!data) return router.push('/admin/products/new');
    setBusy(true);
    // The draft is archived, never deleted: "Restore" on the Products list brings it back.
    const a = await patchProduct(data.productId, { archived: true });
    setBusy(false);
    if (a.status !== 200) return sayBad(refusalText(d, a.data.error, a.data.details));
    setAgain(false);
    say(t(d, 'products.wiz.again.done'));
    router.push('/admin/products/new');
  };

  const key = KEYS[step - 1]!;
  const savedText = savedAt ? t(d, 'products.wiz.saved') : t(d, 'products.wiz.savedNone');
  return (
    <div className="wzp" data-testid="wizard-bar" data-step={step}>
      <div className="wzp-top" data-testid="wizard-head">
        <p className="ad-sub" style={{ margin: 0 }}>{t(d, 'products.wiz.head.sub')}</p>
        <div className="wzp-actions" style={{ marginTop: 0 }}>
          <button type="button" className="ad-btn" onClick={() => setQuick(true)} disabled={!p.can.write} data-testid="wizard-quick">
            {t(d, 'products.wiz.head.quick')}
          </button>
          <button type="button" className="ad-btn" onClick={() => (data ? setAgain(true) : router.push('/admin/products/new'))} data-testid="wizard-again">
            {t(d, 'products.wiz.head.again')}
          </button>
        </div>
      </div>
      <div className="wzp-top" data-testid="wizard-progress">
        <div className="wzp-prog">
          <div className="ad-mini">
            <b>{t(d, 'products.wiz.prog', { n: String(doneN) })}</b>
            {left.length ? ` · ${t(d, 'products.wiz.left')}: ${left.join(', ')}` : ''}
          </div>
          <div className="wzp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={8} aria-valuenow={doneN}>
            <i style={{ width: `${(doneN / 8) * 100}%` }} className={left.length ? 'warn' : undefined} />
          </div>
        </div>
        <span className="ad-mini" aria-live="polite">{savedText}</span>
      </div>
      <ol className="wzp-pills" aria-label={t(d, 'products.wiz.steps')}>
        {KEYS.map((k, i) => {
          const n = i + 1;
          const ok = !!data && flags[i]?.ok && n !== step;
          const cls = `${n === step ? 'on' : ''} ${ok ? 'done' : ''} ${data && !ok && n < step ? 'warn' : ''}`.trim();
          return (
            <li key={k} className={cls || undefined} aria-current={n === step ? 'step' : undefined}>
              <button type="button" onClick={() => void go(n)} disabled={busy || (!data && n > 1)}>
                <b>{ok ? '✓' : n}</b>
                {t(d, `products.wiz.s.${k}.name`)}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="wzp-grid">
        <section className="ad-card" aria-labelledby="wz-h">
          <div className="ad-eyebrow">{t(d, 'products.wiz.of', { n: String(step), total: '8' })}</div>
          <h2 id="wz-h" style={{ margin: '2px 0 4px' }}>{t(d, `products.wiz.s.${key}.title`)}</h2>
          <p className="wzp-why">{t(d, `products.wiz.s.${key}.why`)}</p>
          {!p.can.write ? <Callout kind="warn">{t(d, 'products.wiz.noWrite')}</Callout> : null}
          <div className="wzp-stack">
            {step === 1 ? <StepPick d={d} money={p.money} data={data} lists={p.lists} erp={p.erp} canWrite={p.can.write} setGuard={setGuard} saved={saved} /> : null}
            {ctx && step === 2 ? <StepName c={ctx} setGuard={setGuard} /> : null}
            {ctx && step === 3 ? <StepColours c={ctx} /> : null}
            {ctx && step === 4 ? <StepPhotos c={ctx} /> : null}
            {ctx && step === 5 ? <StepPrice c={ctx} /> : null}
            {ctx && step === 6 ? <StepText c={ctx} /> : null}
            {ctx && step === 7 ? <StepGoogle c={ctx} /> : null}
            {ctx && step === 8 ? <StepPublish c={ctx} flags={flags} canPublish={publishable} listHref={p.listHref} /> : null}
          </div>
          <div className="wzp-nav">
            {step > 1 ? (
              <button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={() => void go(step - 1)}>
                {t(d, 'products.wiz.back')}
              </button>
            ) : (
              <Link className="ad-btn ad-btn-ghost" href={p.listHref}>
                {t(d, 'products.wiz.toList')}
              </Link>
            )}
            {step < 8 ? (
              <button type="button" className="ad-btn ad-btn-primary" disabled={busy} onClick={() => void next()} data-testid="wizard-next">
                {t(d, 'products.wiz.next')}
              </button>
            ) : null}
          </div>
          <p className="ad-mini" style={{ marginTop: 10 }}>{t(d, 'products.wiz.saveNote')}</p>
          {step === 1 && p.resume.length ? (
            <div className="wzp-box" style={{ marginTop: 12 }} data-testid="wizard-resume">
              <div className="ad-mini" style={{ marginBottom: 6 }}>
                <b>{t(d, 'products.wiz.resume')}</b>
              </div>
              <ul className="ad-mini" style={{ margin: 0, paddingLeft: 16 }}>
                {p.resume.map((r) => (
                  <li key={r.productId}>
                    <Link href={`/admin/products/${r.productId}?wizard=${r.step}`}>{r.name ?? r.productId}</Link> {t(d, 'products.wiz.resumeAt', { n: String(r.step) })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
        {ctx ? (
          <WizardPhone c={ctx} />
        ) : (
          <aside className="wzp-side" aria-label={t(d, 'products.wiz.preview')} data-testid="wizard-preview">
            <div className="wzp-ph">
              <div className="wzp-phimg" style={{ background: 'var(--lm-sf2)' }}>
                <span className="no">{t(d, 'products.wiz.noPhoto')}</span>
              </div>
              <div className="wzp-phb">
                <div className="wzp-name">{t(d, 'products.wiz.noName')}</div>
                <div className="wzp-note">{t(d, 'products.wiz.ph.note')}</div>
              </div>
            </div>
          </aside>
        )}
      </div>
      {again ? (
        <Modal
          title={t(d, 'products.wiz.again.title')}
          onClose={() => setAgain(false)}
          foot={
            <>
              <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setAgain(false)}>
                {t(d, 'products.wiz.cancel')}
              </button>
              <button type="button" className="ad-btn ad-btn-primary" onClick={() => void startAgain()} disabled={busy}>
                {t(d, 'products.wiz.again.go')}
              </button>
            </>
          }
        >
          <p>{t(d, 'products.wiz.again.text')}</p>
        </Modal>
      ) : null}
      {quick ? <QuickImport d={d} money={p.money} onClose={() => setQuick(false)} /> : null}
    </div>
  );
}

/** "Quick import": paste ERP style codes, each one comes in as a draft (the same import as step 1); nothing goes on the shop. */
function QuickImport({ d, onClose }: { d: Dict; money: Money; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<{ code: string; ok: boolean; id?: string; why?: string }[]>([]);
  const codes = [...new Set(text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
  const run = async () => {
    setBusy(true);
    const out: typeof rows = [];
    for (const code of codes) {
      const a = await call('POST', '/api/admin/inventory/erp/style', { styleCode: code });
      if (a.status === 200) {
        const r = a.data.imported as { products: { grade: string; productId: string }[] };
        const main = r.products.find((x) => x.grade === 'A') ?? r.products[0];
        out.push({ code, ok: true, id: main?.productId });
      } else out.push({ code, ok: false, why: refusalText(d, a.data.error, a.data.details) });
      setRows([...out]);
    }
    setBusy(false);
    if (out.some((x) => x.ok)) say(t(d, 'products.wiz.quick.done', { n: out.filter((x) => x.ok).length }));
    router.refresh();
  };
  return (
    <Modal
      title={t(d, 'products.wiz.quick.title')}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="ad-btn ad-btn-ghost" onClick={onClose}>
            {t(d, 'products.wiz.quick.close')}
          </button>
          <button type="button" className="ad-btn ad-btn-primary" onClick={() => void run()} disabled={busy || !codes.length}>
            {t(d, 'products.wiz.quick.go', { n: codes.length })}
          </button>
        </>
      }
    >
      <p className="ad-mini">{t(d, 'products.wiz.quick.text')}</p>
      <textarea className="ad-input" rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label={t(d, 'products.wiz.quick.title')} placeholder={t(d, 'products.wiz.quick.ph')} />
      {rows.map((r) => (
        <div key={r.code} className="ad-mini">
          <b className="mono">{r.code}</b> · {r.ok ? t(d, 'products.wiz.quick.ok') : r.why}{' '}
          {r.ok && r.id ? <Link href={`/admin/products/${r.id}?wizard=2`}>{t(d, 'products.wiz.quick.open')}</Link> : null}
        </div>
      ))}
    </Modal>
  );
}
