'use client';
// Website › Policies header: "Open Rules" (where the numbers on every page come from) and "Publish", which presses the
// editor's own Publish button below, so there is one publish path (version checks, drafts and history stay the editor's).
import Link from 'next/link';

export function PolicyHeadButtons({ rulesLabel, publishLabel, canEdit }: { rulesLabel: string; publishLabel: string; canEdit: boolean }) {
  return (
    <>
      <Link className="a2-btn" href="/admin/rules" data-testid="pol-open-rules">
        {rulesLabel}
      </Link>
      {canEdit ? (
        <button
          type="button"
          className="a2-btn pri"
          data-testid="pol-head-publish"
          onClick={() => {
            const b = document.querySelector<HTMLButtonElement>('[data-testid="pol-publish"]');
            if (b && !b.disabled) b.click();
            else b?.scrollIntoView({ block: 'center' });
          }}
        >
          {publishLabel}
        </button>
      ) : null}
    </>
  );
}
