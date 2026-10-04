-- AlterTable
ALTER TABLE "alert" ADD COLUMN "success_story_sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "reunion_snapshot" (
    "id" SERIAL NOT NULL,
    "tag_id" VARCHAR(9) NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "pet_name" VARCHAR(100) NOT NULL,
    "pet_photo_url" TEXT,
    "thank_you_message" VARCHAR(500),
    "resolved_at" TIMESTAMP(3) NOT NULL,
    "neighbours_notified" INTEGER,
    "sightings_reported" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "reunion_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reunion_snapshot_tag_id_key" ON "reunion_snapshot"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "reunion_snapshot_alert_id_key" ON "reunion_snapshot"("alert_id");

-- CreateIndex
CREATE INDEX "reunion_snapshot_expires_at_idx" ON "reunion_snapshot"("expires_at");

-- AddForeignKey
ALTER TABLE "reunion_snapshot" ADD CONSTRAINT "reunion_snapshot_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
