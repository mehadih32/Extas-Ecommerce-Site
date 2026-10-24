-- PR 12 (CN-025, CN-026 (b)): Settings → Admin look. A staff member's own admin choices — the design per admin page
-- and where the guide opens — are kept on their account, so they follow the person to every device. Additive only: one
-- nullable column; nothing is dropped or changed.

-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "adminPrefs" JSONB;
