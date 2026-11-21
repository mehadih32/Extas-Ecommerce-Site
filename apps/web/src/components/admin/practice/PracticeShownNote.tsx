// PR 1208 — the one line a page shows while a feature is on only because practice mode is on (its stored switch is off):
// the page lets the owner look around, and every save still follows the stored switch, so the page says so instead of
// letting a save fail without warning. Words: messages/admin-practice.*.json (practice.shownNote).
import bn from '../../../../messages/admin-practice.bn.json';
import en from '../../../../messages/admin-practice.en.json';

export function practiceShownNoteText(lang: string): string {
  return (lang === 'bn' ? bn : en).practice.shownNote;
}

export function PracticeShownNote({ lang, show }: { lang: string; show: boolean }) {
  if (!show) return null;
  return (
    <p className="a2-sm a2-mute a2-mt12" role="note" data-testid="practice-shown-note">
      {practiceShownNoteText(lang)}
    </p>
  );
}
