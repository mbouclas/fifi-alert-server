-- AlterTable
ALTER TABLE "sighting" ADD COLUMN "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: legacy single photo becomes the first (only) entry
UPDATE "sighting" SET "photos" = ARRAY["photo_url"] WHERE "photo_url" IS NOT NULL;
