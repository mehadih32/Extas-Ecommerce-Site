'use client';
// PR 125 — the mock payment page (A1.3: a mock until the payment service's key arrives, S07). It says plainly that no
// money is taken; "Pay" and "Make it fail (test)" stand for the gateway's two answers. A failure is kept on the order
// (the team sees it) and "Try again" opens a new payment for the same order — never a second order (SIM-F-026).
import '../bag/bag.css';
import './checkout.css';
import { useState } from 'react';
import { fill } from '@/lib/shop/dict';
import type { ShopLang } from '@/lib/shop/lang';
import { Icon } from '../Icon';
import { showToast } from '../toast';
import { PAYMENTS_URL, postJson } from './quote-client';

export interface PayPageProps {
  number: string;
  /** What is to be paid now, already in the page's money format. */
  amount: string;
  method: string;
  failed: boolean;
  open: boolean;
  lang: ShopLang;
  words: Record<string, string>;
  thanks: string;
}

export function PayPage({ number, amount, method, failed, open, lang, words, thanks }: PayPageProps) {
  const [busy, setBusy] = useState(false);
  const w = (k: string, vars: Record<string, string | number> = {}) => fill(words[k] ?? k, vars);
  const act = async (action: 'approve' | 'fail' | 'retry', el: HTMLElement) => {
    if (busy) return;
    setBusy(true);
    const r = await postJson<{ ok: boolean; next?: string }>(PAYMENTS_URL, { number, action, lang });
    if (r.data?.ok && r.data.next) {
      // the same address again (a failure, or try again) still has to show the new state
      window.location.assign(r.data.next);
      if (r.data.next === window.location.pathname) window.location.reload();
      return;
    }
    setBusy(false);
    showToast(el, w(r.data ? 'err.other' : 'err.network'));
  };
  return (
    <div className="container co-wrap co-paypage" data-testid="co-pay-page">
      <div className="card p20 co-paycard">
        <div className="h1">{w('mock.title')}</div>
        <p className="text2 mt8" data-testid="co-pay-number">
          {w('mock.order', { number })}
        </p>
        <div className="co-payamt mt16">
          <span className="text2">{w('mock.amount')}</span>
          <b className="price" data-testid="co-pay-amount">
            {amount}
          </b>
          {method ? <span className="small text2">{w('mock.with', { method })}</span> : null}
        </div>
        <p className="co-paytest mt16" data-testid="co-pay-test">
          <Icon name="info" size={15} />
          <span>{w('mock.test')}</span>
        </p>
        {failed ? (
          <p className="co-payfail mt12" role="alert" data-testid="co-pay-failed">
            <Icon name="info" size={15} />
            <span>{w('mock.failed')}</span>
          </p>
        ) : null}
        <div className="stack s12 mt16">
          {open ? (
            <>
              <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={(e) => void act('approve', e.currentTarget)} data-testid="co-pay-approve">
                <Icon name="lock" size={18} />
                {busy ? w('mock.wait') : w('mock.approve', { amount })}
              </button>
              <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={(e) => void act('fail', e.currentTarget)} data-testid="co-pay-fail">
                {w('mock.fail')}
              </button>
            </>
          ) : failed ? (
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={(e) => void act('retry', e.currentTarget)} data-testid="co-pay-retry">
              {busy ? w('mock.wait') : w('mock.retry')}
            </button>
          ) : (
            <p className="text2">{w('mock.closed')}</p>
          )}
          <a className="link center co-payback" href={thanks} data-testid="co-pay-back">
            {w('mock.back')}
          </a>
        </div>
      </div>
    </div>
  );
}
