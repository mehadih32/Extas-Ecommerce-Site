-- PR 592 follow-up (S12) — house ad impressions: each place's day of views beside its clicks (counted only while
-- `blog.houseAds.countViews` is on, off as shipped), so the House ads page can show views and the click rate.
-- Additive only; nothing is dropped or renamed.
-- AlterTable
ALTER TABLE "HouseAdDailyStat" ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;
