'use client';
// S28 · PR 685 — the add-product wizard's top bar: eight steps (a tick for each one that is done), the step's name and
// why it matters, and Back / "Save and continue". The product screen below shows only this step's parts (wizard.css);
// every save there is the screen's own save. "Save and continue" remembers the step on the draft, so the person can
// leave and "Continue where I stopped" from the Products page. A small phone preview shows the name, price and
// photo count as a customer would first see them.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { t, type Dict } from '@/lib/i18n';
import { Icon } from '../Icon';
import { refusalText } from './model';
import { sayBad } from './useToast';
import './wizard.css';

const KEYS = ['start', 'basics', 'colours', 'photos', 'prices', 'size', 'search', 'publish'] as const;

export interface WizardBarProps {
  dict: Dict;
  step: number;
  /** The draft's id; null on the start page. */
  productId: string | null;
  /** Step 2-8 done flags (index 0 is step 2). */
  done: boolean[];
  canWrite: boolean;
  /** The furthest step reached, for the links. */
  furthest: number;
  preview: {
    name: string;
    price: string | null;
    photos: number;
    colours: number;
  } | null;
}

export function WizardBar(p: WizardBarProps) {
  const d = p.dict;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const key = KEYS[p.step - 1]!;
  const href = (n: number) => (n <= 1 ? '/admin/products/new' : `/admin/products/${p.productId}?wizard=${n}`);

  const go = async (n: number) => {
    if (!p.productId || n < 2 || n > 8) return router.push(href(n));
    setBusy(true);
    try {
      if (p.canWrite) {
        const a = await call('POST', `/api/admin/products/${p.productId}/wizard`, { step: n });
        if (a.status !== 200) return sayBad(refusalText(d, a.data.error, a.data.details));
      }
      router.push(href(n));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wz" data-testid="wizard-bar" data-step={p.step}>
      <ol className="wz-steps" aria-label={t(d, 'products.wiz.steps')}>
        {KEYS.map((k, i) => {
          const n = i + 1;
          const isDone = n === 1 ? !!p.productId : !!p.done[n - 2];
          const reach = n === 1 || (!!p.productId && n <= Math.max(p.furthest, p.step) + 1);
          const cls = `wz-step${n === p.step ? ' on' : ''}${isDone ? ' done' : ''}`;
          return (
            <li key={k} className={cls} aria-current={n === p.step ? 'step' : undefined}>
              {reach && n !== p.step ? (
                <Link
                  href={href(n)}
                  className="wz-link"
                  onClick={(e) => {
                    if (p.productId && n >= 2) {
                      e.preventDefault();
                      void go(n);
                    }
                  }}
                >
                  <span className="wz-n">{isDone ? <Icon name="check" size={12} /> : n}</span>
                  <span className="wz-t">{t(d, `products.wiz.s.${k}.name`)}</span>
                </Link>
              ) : (
                <span className="wz-link">
                  <span className="wz-n">{isDone && n !== p.step ? <Icon name="check" size={12} /> : n}</span>
                  <span className="wz-t">{t(d, `products.wiz.s.${k}.name`)}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="wz-body">
        <div className="wz-main">
          <div className="ad-eyebrow">{t(d, 'products.wiz.of', { n: String(p.step), total: '8' })}</div>
          <h2 className="wz-h">{t(d, `products.wiz.s.${key}.title`)}</h2>
          <p className="ad-sub">{t(d, `products.wiz.s.${key}.why`)}</p>
          {p.productId ? (
            <div className="wz-nav">
              {p.step > 2 ? (
                <button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={() => void go(p.step - 1)}>
                  {t(d, 'products.wiz.back')}
                </button>
              ) : null}
              {p.step < 8 ? (
                <button type="button" className="ad-btn ad-btn-primary" disabled={busy} onClick={() => void go(p.step + 1)} data-testid="wizard-next">
                  {t(d, 'products.wiz.next')}
                </button>
              ) : null}
              <Link className="wz-skip" href={`/admin/products/${p.productId}`}>
                {t(d, 'products.wiz.full')}
              </Link>
            </div>
          ) : null}
          <p className="ad-mini">{t(d, 'products.wiz.saveNote')}</p>
        </div>
        {p.preview ? (
          <aside className="wz-phone" aria-label={t(d, 'products.wiz.preview')} data-testid="wizard-preview">
            <div className="wz-ph">
              <div className="wz-img wz-none">{t(d, 'products.wiz.noPhoto')}</div>

              <div className="wz-pn">{p.preview.name || t(d, 'products.wiz.noName')}</div>
              <div className="wz-pp">{p.preview.price ?? t(d, 'products.wiz.noPrice')}</div>
              <div className="ad-mini">
                {t(d, 'products.wiz.counts', {
                  photos: String(p.preview.photos),
                  colours: String(p.preview.colours),
                })}
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
