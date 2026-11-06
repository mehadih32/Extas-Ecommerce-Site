// S02 · PR 76 — one section of a page the owner arranged (Website › Page layouts): drawn as it is when it shows on
// every screen; kept to phones or to computers by a wrapper the shop's style sheet hides (`ly-phone`, `ly-desk`,
// shop-app.css). The wrapper takes no box of its own (display: contents), so the page looks the same.
// S02 · PR 600: while the signed-in owner's on-page Edit mode is on (lib/website/page-edit-shop), every section gets the
// same box-less wrapper with its page and id, so the bar can outline it and open its settings. Customers: as before.
import type { ReactNode } from 'react';
import type { LayoutDevice } from '@extas/settings';
import { deviceClass } from '@/lib/shop/layouts';
import type { EditPage } from '@/lib/website/page-edit-model';
import { pageEditState } from '@/lib/website/page-edit-shop';

export async function LayoutPart({ dev, id, page, children }: { dev: LayoutDevice; id: string; page?: EditPage; children: ReactNode }) {
  const cls = deviceClass(dev);
  const empty = children === null || children === undefined || children === false;
  const mark = page && !empty ? (await pageEditState())?.edit === true : false;
  if (!mark && (!cls || empty)) return <>{children}</>;
  return (
    <div className={cls ?? 'pe-sec'} data-ly={id} data-pe={mark ? id : undefined} data-pe-page={mark ? page : undefined}>
      {children}
    </div>
  );
}
