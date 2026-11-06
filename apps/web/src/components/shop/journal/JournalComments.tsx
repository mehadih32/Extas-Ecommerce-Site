// S12 · PR 251 — the comment part under a live article, drawn only while `blog.comments.on` (off as shipped: the journal
// runs without comments and nothing of this is drawn). The comments a person has shown (newest first, at most
// `blog.comments.shown`), each with only the first word of its name, then the comment box — or, while only signed-in
// customers may write and this reader is signed out, a sign-in link that comes back here. Plain text only: a comment
// is never drawn as a link or as HTML.
import type { BlogCommentsSettings } from '@extas/settings';
import { dateText } from '@/lib/shop/account-view';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import type { ShownComment } from '@/lib/journal/comments';
import { BODY_MIN, shownName } from '@/lib/journal/comments-model';
import { CommentForm, type CommentFormWords } from './CommentForm';

const FORM_WORDS = ['write', 'label', 'name', 'send', 'sending', 'note', 'thanks', 'again', 'signIn', 'limit', 'invalid', 'needName', 'closed', 'failed', 'chars'] as const;

export function JournalComments({ c, postId, slug, settings, comments, canWrite }: { c: ShopContext; postId: string; slug: string; settings: BlogCommentsSettings; comments: ShownComment[]; canWrite: boolean }) {
  const w = Object.fromEntries(FORM_WORDS.map((k) => [k, k === 'invalid' ? c.t('journal.cm.invalid', { min: c.num(BODY_MIN), n: c.num(settings.maxChars) }) : k === 'chars' ? c.t('journal.cm.chars', { n: '{n}', max: '{max}' }) : c.t(`journal.cm.${k}`)])) as unknown as CommentFormWords;
  const signIn = `${hrefIn(c.lang, ROUTES.login)}?next=${encodeURIComponent(hrefIn(c.lang, ROUTES.article(slug)))}`;
  return (
    <section className="jn-comments" aria-labelledby="jn-cm-h" data-testid="jn-comments">
      <h2 className="h3" id="jn-cm-h">
        {c.t('journal.cm.h')}
      </h2>
      {comments.length ? (
        <ul className="jn-cm-list">
          {comments.map((x) => (
            <li key={x.id}>
              <div className="jn-cm-who">
                <b>{shownName(x.name, c.t('journal.cm.reader'))}</b>
                <span className="small text2">{dateText(c, x.at.toISOString())}</span>
              </div>
              <p className="jn-cm-body">{x.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small text2">{c.t('journal.cm.none')}</p>
      )}
      {canWrite ? (
        <CommentForm postId={postId} words={w} maxChars={settings.maxChars} askName={settings.who === 'anyone'} signInHref={signIn} />
      ) : (
        <p className="jn-cm-said">
          <a href={signIn} data-testid="jn-comment-signin">
            {w.signIn}
          </a>
        </p>
      )}
    </section>
  );
}
