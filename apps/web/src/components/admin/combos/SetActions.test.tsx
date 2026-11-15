// PR 786 (lane D1): the foot of a set card as the prototype draws it. A set that is Off keeps its switch, Edit and Archive; an
// Archived set shows only "Archived" and "Bring back"; someone without the publish right gets no switch to use and no Archive.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SetActions, type SetActionsTexts } from './SetActions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const texts: SetActionsTexts = { on: 'On the shop', off: 'Off', edit: 'Edit', archive: 'Archive', bringBack: 'Bring back', archived: 'Archived', confirm: 'Archive this set?', confirmBody: 'It leaves the shop.', cancel: 'Cancel', failed: 'Failed', notReady: 'Not ready' };
const draw = (p: { on: boolean; archived: boolean; canPublish?: boolean; canEdit?: boolean }) => renderToStaticMarkup(<SetActions id="s1" canPublish canEdit texts={texts} {...p} />);

describe('SetActions', () => {
  it('on: the switch is checked and says "On the shop", with Edit and Archive', () => {
    const h = draw({ on: true, archived: false });
    expect(h).toContain('On the shop');
    expect(h).toContain('checked');
    expect(h).toContain('Edit');
    expect(h).toContain('Archive');
  });
  it('off is not archived: the switch stays, saying "Off", with Edit and Archive', () => {
    const h = draw({ on: false, archived: false });
    expect(h).toContain('>Off<');
    expect(h).toContain('role="switch"');
    expect(h).toContain('Archive');
    expect(h).not.toContain('Bring back');
  });
  it('archived: "Archived" and "Bring back" only', () => {
    const h = draw({ on: false, archived: true });
    expect(h).toContain('Archived');
    expect(h).toContain('Bring back');
    expect(h).not.toContain('role="switch"');
    expect(h).not.toContain('>Edit<');
  });
  it('without the publish right the switch is disabled and there is no Archive or Bring back', () => {
    const h = draw({ on: true, archived: false, canPublish: false });
    expect(h).toContain('disabled');
    expect(h).not.toContain('>Archive<');
    expect(draw({ on: false, archived: true, canPublish: false })).not.toContain('Bring back');
  });
  it('without the edit right there is no Edit', () => {
    expect(draw({ on: true, archived: false, canEdit: false })).not.toContain('>Edit<');
  });
});
