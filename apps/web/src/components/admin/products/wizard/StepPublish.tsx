'use client';
// S28 · PR 1037 — wizard step 8, "Check & publish" (prototype v5): the check of every step (a front photo for every colour and a confirmed
// price stop publishing, the rest only warn), the question about sample products, and three buttons — "Publish now", "Publish at …" and
// "Save as draft". Nothing is on the shop before one of the first two is pressed.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import { refusalText } from '../model';
import { say, sayBad } from '../useToast';
import { Callout, CheckLine, Fld, Switch } from '../wizard-ui';
import { postSpec, publishWizard, unschedule } from './api';
import type { Ctx } from './ctx';

export interface StepPublishProps {
  c: Ctx;
  flags: { ok: boolean; miss: string }[];
  canPublish: boolean;
  listHref: string;
}

const STEP_KEYS = ['start', 'basics', 'colours', 'photos', 'prices', 'size', 'search'] as const;

export function StepPublish({ c, flags, canPublish, listHref }: StepPublishProps) {
  const { d, data } = c;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState(data.spec.scheduleAt ? data.spec.scheduleAt.slice(0, 16) : '');
  const [hideDemo, setHideDemo] = useState(data.spec.hideDemo ?? true);
  const scheduled = data.status === 'READY_TO_PUBLISH' && !!data.spec.scheduleAt;

  const finish = async (mode: 'now' | 'schedule') => {
    if (mode === 'schedule' && !when) return sayBad(t(d, 'products.wiz.pub.needTime'));
    setBusy(true);
    const at = mode === 'schedule' ? new Date(when).toISOString() : undefined;
    const a = await publishWizard(data.productId, mode, at);
    setBusy(false);
    if (a.status !== 200) {
      const det = (a.data.details as string[] | undefined) ?? [];
      const known = det.filter((x) => ['NO_COLOUR', 'FRONT_PHOTO', 'PRICE_NOT_CONFIRMED'].includes(x)).map((x) => t(d, `products.wiz.pub.gap_${x}`));
      return sayBad(known.length ? known.join(' ') : refusalText(d, a.data.error, a.data.details));
    }
    say(t(d, mode === 'now' ? 'products.wiz.pub.liveDone' : 'products.wiz.pub.scheduledDone'));
    router.push(mode === 'now' ? `/admin/products/${data.productId}` : listHref);
  };
  const saveDraft = () => {
    say(t(d, 'products.wiz.pub.draftKept'));
    router.push(listHref);
  };
  const back = async () => {
    setBusy(true);
    const a = await unschedule(data.productId);
    setBusy(false);
    if (a.status !== 200) return sayBad(refusalText(d, a.data.error, a.data.details));
    c.refresh();
  };

  return (
    <>
      <div className="wzp-box" data-testid="wizard-check">
        {STEP_KEYS.map((k, i) => {
          const f = flags[i]!;
          const stop = !f.ok && (k === 'photos' || k === 'prices');
          return (
            <CheckLine key={k} state={f.ok ? 'ok' : stop ? 'stop' : 'no'}>
              {t(d, `products.wiz.pub.ck_${k}${f.ok ? '' : `_${f.miss || 'no'}`}`)}
            </CheckLine>
          );
        })}
        <div className="ad-mini" style={{ marginTop: 6 }}>{t(d, 'products.wiz.pub.need')}</div>
      </div>
      {data.bGradePieces > 0 && data.spec.bGrade ? <Callout kind="info">{t(d, 'products.wiz.pub.bgrade', { n: data.bGradePieces })}</Callout> : null}
      {c.demoCount > 0 ? (
        <div className="wzp-box" data-testid="wiz-demo">
          <Switch
            id="wz-demo"
            checked={hideDemo}
            disabled={!c.can.write}
            onChange={(v) => {
              setHideDemo(v);
              void postSpec(data.productId, { hideDemo: v }).then((a) => (a.status === 200 ? c.saved() : c.refuse(a)));
            }}
            label={t(d, 'products.wiz.pub.demo', { n: c.demoCount })}
          />
          <div className="ad-mini" style={{ marginTop: 6 }}>{t(d, 'products.wiz.pub.demoNote')}</div>
        </div>
      ) : null}
      {scheduled ? (
        <Callout kind="info">
          {t(d, 'products.wiz.pub.scheduledAt', { at: new Date(data.spec.scheduleAt!).toLocaleString() })}{' '}
          <button type="button" className="ad-btn ad-btn-ghost" onClick={() => void back()} disabled={busy}>
            {t(d, 'products.wiz.pub.unschedule')}
          </button>
        </Callout>
      ) : null}
      {!c.can.publish ? <Callout kind="warn">{t(d, 'products.wiz.pub.noRight')}</Callout> : null}
      <Fld dict={d} label={t(d, 'products.wiz.pub.when')} htmlFor="wz-when" hint={t(d, 'products.wiz.pub.whenHint')}>
        <input id="wz-when" className="ad-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={!c.can.publish} />
      </Fld>
      <div className="wzp-actions">
        <button type="button" className="ad-btn ad-btn-primary" onClick={() => void finish('now')} disabled={busy || !c.can.publish || !canPublish} data-testid="wiz-publish">
          {t(d, 'products.wiz.pub.now')}
        </button>
        <button type="button" className="ad-btn" onClick={() => void finish('schedule')} disabled={busy || !c.can.publish || !canPublish || !when} data-testid="wiz-schedule">
          {t(d, 'products.wiz.pub.schedule')}
        </button>
        <button type="button" className="ad-btn ad-btn-ghost" onClick={saveDraft} disabled={busy} data-testid="wiz-draft">
          {t(d, 'products.wiz.pub.draft')}
        </button>
      </div>
      {!canPublish ? <div className="ad-mini" style={{ marginTop: 6 }}>{t(d, 'products.wiz.pub.blocked')}</div> : null}
    </>
  );
}
