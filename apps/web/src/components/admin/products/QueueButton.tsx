'use client';
// PR 35 — the publish queue's buttons: "Publish" on one product (refused by the server until its checklist passes) and
// "Check all again" for the products on the page.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BulkResult } from '@extas/catalogue';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { Icon } from '../Icon';
import { formatNumber, refusalText } from './model';
import { useToast } from './useToast';

type Props = { dict: Dict; locale: string; disabled?: boolean } & ({ kind: 'publish'; productId: string; name: string } | { kind: 'recheck'; productIds: string[] });

export function QueueButton(props: Props) {
  const { dict: d } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [toast, say] = useToast();

  const go = async () => {
    setBusy(true);
    try {
      if (props.kind === 'publish') {
        const a = await call('POST', `/api/admin/catalogue/products/${props.productId}/publish`, { action: 'publish' });
        if (a.status !== 200) return say(refusalText(d, a.data.error, a.data.details));
        say(t(d, 'queue.published', { name: props.name }));
      } else {
        const a = await call('POST', '/api/admin/catalogue/products/bulk', { action: 'recheck', productIds: props.productIds });
        if (a.status !== 200) return say(refusalText(d, a.data.error, a.data.details));
        const res = a.data.bulk as BulkResult;
        say(t(d, 'queue.rechecked', { n: formatNumber(res.done, props.locale) }));
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {props.kind === 'publish' ? (
        <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy || props.disabled} onClick={go}>
          <Icon name="check" size={16} />
          {t(d, 'queue.publish')}
        </button>
      ) : (
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy || props.disabled || !props.productIds.length} onClick={go}>
          {t(d, 'queue.recheck')}
        </button>
      )}
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
