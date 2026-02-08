-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE 'ALERT_ZONE';

-- CreateTable
CREATE TABLE "alert_zone" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "location_point" geometry(Point, 4326) NOT NULL,
    "radius_meters" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_zone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_zone_user_id_idx" ON "alert_zone"("user_id");

-- CreateIndex
CREATE INDEX "alert_zone_is_active_idx" ON "alert_zone"("is_active");

-- CreateIndex
CREATE INDEX "alert_zone_gist_idx" ON "alert_zone" USING GIST ("location_point");

-- AddForeignKey
ALTER TABLE "alert_zone" ADD CONSTRAINT "alert_zone_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
