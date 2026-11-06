// S02 · PR 76 — one section of a page the owner arranged (Website › Page layouts): drawn as it is when it shows on
// every screen; kept to phones or to computers by a wrapper the shop's style sheet hides (`ly-phone`, `ly-desk`,
// shop-app.css). The wrapper takes no box of its own (display: contents), so the page looks the same.
import type { ReactNode } from 'react';
import type { LayoutDevice } from '@extas/settings';
import { deviceClass } from '@/lib/shop/layouts';

export function LayoutPart({ dev, id, children }: { dev: LayoutDevice; id: string; children: ReactNode }) {
  const cls = deviceClass(dev);
  if (!cls || children === null || children === undefined || children === false) return <>{children}</>;
  return (
    <div className={cls} data-ly={id}>
      {children}
    </div>
  );
}
