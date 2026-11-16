// PR 1020 (D12): Roles is part of the one Team & roles page now (prototype m-settings.js renderTeam: "What each role can open").
// The old address keeps working: it leads to that part of the page. Seeing and changing roles still needs `roles.read` / `roles.manage`.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function RolesPage() {
  redirect('/admin/settings/people#roles');
}
