// PR 762 — the head of an admin page (title, the line under it, the guide button, the page's buttons on the right) as a
// plain component with nothing from the server in it, so a client screen (Smart rules, Offers, Notices …) can draw the same
// head as the pages the server draws (ShellParts re-exports both). It only needs the words (`dict`) and the page's place.
import type { ReactNode } from 'react';
import { guideOf, type ShellPlace } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { GuideButton } from './ShellButtons';

/** What the head needs of the admin view: its words. */
export interface HeadView {
  dict: Dict;
}

/** The guide button of a place (always Bengali: the guides are, CN-014); `overview`: the section's overview alone. */
export function PlaceGuide({ view, place, overview }: { view: HeadView; place: ShellPlace; overview?: boolean }) {
  // A tab with its own guide (Stock, Size charts …) names itself in the panel's title; otherwise the section does.
  const name = place.tab?.guide ? t(view.dict, `shell.tab.${place.section.id}.${place.tab.id}`) : t(view.dict, `shell.sec.${place.section.id}`);
  return <GuideButton slug={guideOf(place)} section={name} label={t(view.dict, 'shell.guide.button')} page={overview ? `${place.section.id}/index` : undefined} />;
}

export function PageHead({ view, place, title, sub, right, crumb }: { view: HeadView; place: ShellPlace | null; title: string; sub?: ReactNode; right?: ReactNode; crumb?: ReactNode }) {
  return (
    <div className="a2-ph">
      <div>
        {crumb ? <div className="a2-crumb">{crumb}</div> : null}
        <h1 className="a2-h1">{title}</h1>
        {sub ? <p className="a2-subt">{sub}</p> : null}
      </div>
      <div className="a2-phr">
        {place ? <PlaceGuide view={view} place={place} /> : null}
        {right}
      </div>
    </div>
  );
}
