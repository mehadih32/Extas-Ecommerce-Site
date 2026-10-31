-- PR 344 follow-up (S16, MNY-04, CN-031): a retail expense may keep a photo (or PDF) of its receipt — the media library's
-- copy (MediaAsset.id, folder "expense-receipts"), added on Money → Expenses while `costs.receipts` is on. Only adds a
-- nullable column; nothing existing changes.
ALTER TABLE "RetailExpense" ADD COLUMN "receiptMediaId" UUID;
