'use client';
// S08 · PR 180 — "Handed over" on a courier's open handover batch: the name of the rider who took the parcels, then the
// batch is marked handed over; the answer says how many orders moved on and names any left out (what changed since the
// sheet was printed), in words from the page's messages.
import { Act } from './Act';
import { t, type Dict } from '@/lib/i18n';

/** Why an order was left out (`ful.handover.skip.<code>`, else the general words). */
function skipWord(dict: Dict, reason: string | undefined): string {
  const key = `ful.handover.skip.${reason ?? ''}`;
  const s = t(dict, key);
  return s === key ? t(dict, 'ful.handover.skip.other') : s;
}

export function HandoverDone({ dict, url, batchId, testId }: { dict: Dict; url: string; batchId: string; testId?: string }) {
  const done = (a: Record<string, unknown>) => {
    const handed = Array.isArray(a.handedOver) ? a.handedOver.length : 0;
    const skipped = Array.isArray(a.skipped) ? (a.skipped as { orderNumber?: string; reason?: string }[]) : [];
    const left = skipped.map((s) => `${s.orderNumber ?? ''} (${skipWord(dict, s.reason)})`);
    return left.length ? t(dict, 'ful.handover.doneSome', { n: handed, left: left.join(', ') }) : t(dict, 'ful.handover.doneAll', { n: handed });
  };
  return (
    <Act
      dict={dict}
      url={url}
      body={{ batchId }}
      label={t(dict, 'ful.handover.done')}
      busyLabel={t(dict, 'ful.handover.doing')}
      note={{ field: 'receivedBy', label: t(dict, 'ful.handover.receivedBy'), placeholder: t(dict, 'ful.handover.receivedByPh') }}
      tone="pri"
      testId={testId}
      done={done}
    />
  );
}
