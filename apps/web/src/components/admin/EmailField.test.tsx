// PR 500 (owner, 20 Oct 15:20) — the e-mail hint on the sign-in: "admin" (no "@") gets "write the full e-mail address"
// in the admin's language once the field is left; a full address, an empty field or a field not yet left gets none.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import bn from '../../../messages/admin.bn.json';
import en from '../../../messages/admin.en.json';
import { t, type Dict } from '@/lib/i18n';
import { EMAIL_HINT_ID, EmailField, emailMissingAt } from './EmailField';

const noop = () => {};
const draw = (dict: Dict, value: string, hint: boolean) => renderToStaticMarkup(<EmailField dict={dict} value={value} hint={hint} disabled={false} onChange={noop} onBlur={noop} />);

describe('the sign-in e-mail hint', () => {
  it('flags a value without an "@", never an empty field or a full address', () => {
    for (const v of ['admin', ' admin ', 'owner.shop', 'a']) expect(emailMissingAt(v), v).toBe(true);
    for (const v of ['', '   ', 'admin@example.test', ' a@b ']) expect(emailMissingAt(v), v).toBe(false);
  });

  it('shows the hint in the admin language, tied to the field for screen readers', () => {
    const html = draw(bn, 'admin', true);
    expect(html).toContain(t(bn, 'login.emailHint'));
    expect(html).toContain(`id="${EMAIL_HINT_ID}"`);
    expect(html).toContain(`aria-describedby="${EMAIL_HINT_ID}"`);
    expect(html).toContain('aria-invalid="true"');
    expect(draw(en, 'admin', true)).toContain(t(en, 'login.emailHint'));
  });

  it('stays quiet while typing, for a full address and for an empty field', () => {
    for (const [v, hint] of [['admin', false], ['admin@example.test', true], ['', true]] as const) {
      const html = draw(bn, v, hint);
      expect(html, v).not.toContain(EMAIL_HINT_ID);
      expect(html, v).not.toContain('aria-invalid');
    }
  });

  it('the hint text is in both message files and says "e-mail"', () => {
    expect(t(bn, 'login.emailHint')).toMatch(/ই-মেইল/);
    expect(t(en, 'login.emailHint')).toMatch(/full e-mail address/i);
  });
});
