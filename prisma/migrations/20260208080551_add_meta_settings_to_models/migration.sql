-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "settings" JSONB;

-- AlterTable
ALTER TABLE "account" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "settings" JSONB;

-- AlterTable
ALTER TABLE "alert" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "settings" JSONB;

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "settings" JSONB;

-- AlterTable
ALTER TABLE "pet_type" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "settings" JSONB;

-- AlterTable
ALTER TABLE "sighting" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "settings" JSONB;

