// PR 1020 (D12): Staff controls (discount limits, hide phone and address, the end-of-day handover) is part of the one Team & roles
// page now (prototype m-settings.js renderTeam: "Staff limits" and "End-of-day cash & bKash handover"). The old address keeps working.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function StaffControlsPage() {
  redirect('/admin/settings/people#staff-limits');
}
