// PR 41 — a section's heading row (demo 20-home.js hm_secHd): the title, an optional line under it, and the "View all"
// link on the right. `aside` takes extra content on the right (the reviews' average on a desktop).
import type { ReactNode } from 'react';
import { Icon } from '../Icon';

export function SecHd({ title, sub, href, more, aside }: { title: string; sub?: string; href?: string; more?: string; aside?: ReactNode }) {
  return (
    <div className="sec-hd">
      <div>
        <h2 className="h2">{title}</h2>
        {sub ? <p className="small muted hm-sub">{sub}</p> : null}
      </div>
      {aside}
      {href && more ? (
        <a className="hm-more" href={href}>
          {more}
          <Icon name="right" size={14} />
        </a>
      ) : null}
    </div>
  );
}
