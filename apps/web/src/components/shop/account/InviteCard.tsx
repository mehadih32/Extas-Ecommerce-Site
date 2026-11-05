'use client';
// S13 · PR 273 — My account › For you: "Invite a friend" while the referral programme runs (shown only to a signed-in
// customer, Blueprint "only in logged-in dashboards"): his own invite code, "Copy code" and "Share on WhatsApp" (a
// message with the code and the shop's link: the bag link `/bag?code=` while code links are on, else the home page).
import { fill } from '@/lib/shop/dict';
import { showToast } from '../toast';

type W = Record<string, string>;

export function InviteCard({ code, sub, usedLine, path, words }: { code: string; sub: string; usedLine: string | null; path: string; words: W }) {
  const share = () => {
    const link = `${window.location.origin}${path}`;
    return `https://wa.me/?text=${encodeURIComponent(fill(words['invite.shareText'] ?? '', { code, link }))}`;
  };
  return (
    <section className="card p20 stack s12" aria-labelledby="fy-inv" data-testid="acc-invite">
      <h2 className="h3" id="fy-inv">
        {words['invite.title']}
      </h2>
      <p className="small text2">{sub}</p>
      <p className="small">
        {words['invite.code']}{' '}
        <strong className="h3" data-testid="acc-invite-code">
          {code}
        </strong>
      </p>
      <div className="row wrap" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="acc-invite-copy"
          onClick={(e) => {
            const el = e.currentTarget;
            void navigator.clipboard?.writeText(code).catch(() => {});
            showToast(el, fill(words['invite.copied'] ?? '', { code }));
          }}
        >
          {words['invite.copy']}
        </button>
        <a className="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" data-testid="acc-invite-share" href={`https://wa.me/?text=${encodeURIComponent(code)}`} onClick={(e) => (e.currentTarget.href = share())}>
          {words['invite.share']}
        </a>
      </div>
      {usedLine ? <p className="small text2">{usedLine}</p> : null}
    </section>
  );
}
