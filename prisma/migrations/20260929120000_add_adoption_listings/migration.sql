-- CreateEnum
CREATE TYPE "AdoptionStatus" AS ENUM ('AVAILABLE', 'ADOPTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "adoption_listing" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "AdoptionStatus" NOT NULL DEFAULT 'AVAILABLE',
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "location_point" geometry(Point, 4326) NOT NULL,
    "location_address" VARCHAR(255),
    "description" TEXT,
    "adopted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adoption_listing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adoption_listing_pet_id_key" ON "adoption_listing"("pet_id");

-- CreateIndex
CREATE INDEX "adoption_listing_user_id_idx" ON "adoption_listing"("user_id");

-- CreateIndex
CREATE INDEX "adoption_listing_status_idx" ON "adoption_listing"("status");

-- CreateIndex
CREATE INDEX "adoption_listing_location_gist_idx" ON "adoption_listing" USING GIST ("location_point");

-- AddForeignKey
ALTER TABLE "adoption_listing" ADD CONSTRAINT "adoption_listing_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_listing" ADD CONSTRAINT "adoption_listing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
