// PR 500 (owner, 20 Oct 15:20) — the sign-in's e-mail field. The owner typed "admin" and the sign-in only said the
// e-mail or password was wrong; now a value without an "@" gets a short hint under the field ("write the full e-mail
// address") in the admin's language, from messages/admin.<lang>.json (`login.emailHint`). The hint shows once the
// field is left or the form is sent, and goes the moment an "@" is typed. No hook here, so it renders on the server.
import { t, type Dict } from '@/lib/i18n';

export const EMAIL_HINT_ID = 'ad-email-hint';

/** True when something is typed but it cannot be an e-mail address yet (no "@"). An empty field is not flagged. */
export function emailMissingAt(value: string): boolean {
  const v = value.trim();
  return v !== '' && !v.includes('@');
}

export function EmailField({ dict, value, hint, disabled, onChange, onBlur }: { dict: Dict; value: string; hint: boolean; disabled: boolean; onChange: (v: string) => void; onBlur: () => void }) {
  const show = hint && emailMissingAt(value);
  return (
    <div>
      <label className="ad-label" htmlFor="ad-email">{t(dict, 'login.email')}</label>
      <input
        id="ad-email"
        className="ad-input"
        type="email"
        autoComplete="username"
        inputMode="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        required
        disabled={disabled}
        aria-invalid={show ? true : undefined}
        aria-describedby={show ? EMAIL_HINT_ID : undefined}
      />
      {show ? (
        <p id={EMAIL_HINT_ID} className="ad-err ad-field-hint" role="status">
          {t(dict, 'login.emailHint')}
        </p>
      ) : null}
    </div>
  );
}
