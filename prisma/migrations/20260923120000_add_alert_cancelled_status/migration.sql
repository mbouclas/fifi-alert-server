-- AlterEnum
ALTER TYPE "AlertStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "alert" ADD COLUMN "cancelled_at" TIMESTAMP(3);
