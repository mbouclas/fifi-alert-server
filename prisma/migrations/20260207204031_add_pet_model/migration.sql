-- CreateEnum
CREATE TYPE "PetType" AS ENUM ('DOG', 'CAT', 'BIRD', 'RABBIT', 'HAMSTER', 'GUINEA_PIG', 'FERRET', 'TURTLE', 'LIZARD', 'SNAKE', 'FISH', 'OTHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "Size" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- AlterTable
ALTER TABLE "alert" ADD COLUMN     "pet_id" INTEGER;

-- CreateTable
CREATE TABLE "pet" (
    "id" SERIAL NOT NULL,
    "tag_id" VARCHAR(9) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "PetType" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "gender" "Gender",
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "size" "Size",
    "is_missing" BOOLEAN NOT NULL DEFAULT false,
    "birthday" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pet_tag_id_key" ON "pet"("tag_id");

-- CreateIndex
CREATE INDEX "pet_user_id_idx" ON "pet"("user_id");

-- CreateIndex
CREATE INDEX "pet_tag_id_idx" ON "pet"("tag_id");

-- CreateIndex
CREATE INDEX "pet_is_missing_idx" ON "pet"("is_missing");

-- CreateIndex
CREATE INDEX "alert_pet_id_idx" ON "alert"("pet_id");

-- AddForeignKey
ALTER TABLE "pet" ADD CONSTRAINT "pet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
