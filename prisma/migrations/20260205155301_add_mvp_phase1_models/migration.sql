-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PetSpecies" AS ENUM ('DOG', 'CAT', 'BIRD', 'RABBIT', 'OTHER');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('GPS', 'IP', 'POSTAL_CODE', 'MANUAL');

-- CreateEnum
CREATE TYPE "NotificationConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'EXCLUDED');

-- CreateTable
CREATE TABLE "alert" (
    "id" SERIAL NOT NULL,
    "creator_id" INTEGER NOT NULL,
    "pet_name" TEXT NOT NULL,
    "pet_species" "PetSpecies" NOT NULL,
    "pet_breed" TEXT,
    "pet_description" TEXT NOT NULL,
    "pet_color" TEXT,
    "pet_age_years" INTEGER,
    "pet_photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_seen_lat" DOUBLE PRECISION NOT NULL,
    "last_seen_lon" DOUBLE PRECISION NOT NULL,
    "location_point" geometry(Point, 4326) NOT NULL,
    "location_address" TEXT,
    "alert_radius_km" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "time_last_seen" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "renewal_count" INTEGER NOT NULL DEFAULT 0,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "is_phone_public" BOOLEAN NOT NULL DEFAULT false,
    "affected_postal_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "reward_offered" BOOLEAN NOT NULL DEFAULT false,
    "reward_amount" DECIMAL(10,2),

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_uuid" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "os_version" TEXT,
    "app_version" TEXT,
    "push_token" TEXT,
    "push_token_updated_at" TIMESTAMP(3),
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "gps_lat" DOUBLE PRECISION,
    "gps_lon" DOUBLE PRECISION,
    "gps_point" geometry(Point, 4326),
    "gps_accuracy_meters" DOUBLE PRECISION,
    "gps_updated_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "ip_lat" DOUBLE PRECISION,
    "ip_lon" DOUBLE PRECISION,
    "ip_point" geometry(Point, 4326),
    "ip_city" TEXT,
    "ip_country" TEXT,
    "ip_updated_at" TIMESTAMP(3),
    "postal_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_app_open" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_zone" (
    "id" SERIAL NOT NULL,
    "device_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "location_point" geometry(Point, 4326) NOT NULL,
    "radius_km" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sighting" (
    "id" SERIAL NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "sighting_lat" DOUBLE PRECISION NOT NULL,
    "sighting_lon" DOUBLE PRECISION NOT NULL,
    "location_point" geometry(Point, 4326) NOT NULL,
    "location_address" TEXT,
    "photo_url" TEXT,
    "notes" TEXT,
    "confidence" TEXT,
    "sighting_time" TIMESTAMP(3) NOT NULL,
    "direction" TEXT,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissed_at" TIMESTAMP(3),
    "dismissed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "device_id" INTEGER NOT NULL,
    "confidence" "NotificationConfidence" NOT NULL,
    "match_reason" TEXT NOT NULL,
    "distance_km" DOUBLE PRECISION,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "exclusion_reason" TEXT,
    "push_message_id" TEXT,
    "push_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_creator_id_idx" ON "alert"("creator_id");

-- CreateIndex
CREATE INDEX "alert_status_idx" ON "alert"("status");

-- CreateIndex
CREATE INDEX "alert_expires_at_idx" ON "alert"("expires_at");

-- CreateIndex
CREATE INDEX "alert_affected_postal_codes_idx" ON "alert" USING GIN ("affected_postal_codes");

-- CreateIndex
CREATE INDEX "alert_location_gist_idx" ON "alert" USING GIST ("location_point");

-- CreateIndex
CREATE UNIQUE INDEX "device_device_uuid_key" ON "device"("device_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "device_push_token_key" ON "device"("push_token");

-- CreateIndex
CREATE INDEX "device_user_id_idx" ON "device"("user_id");

-- CreateIndex
CREATE INDEX "device_device_uuid_idx" ON "device"("device_uuid");

-- CreateIndex
CREATE INDEX "device_push_token_idx" ON "device"("push_token");

-- CreateIndex
CREATE INDEX "device_gps_gist_idx" ON "device" USING GIST ("gps_point");

-- CreateIndex
CREATE INDEX "device_ip_gist_idx" ON "device" USING GIST ("ip_point");

-- CreateIndex
CREATE INDEX "device_postal_codes_idx" ON "device" USING GIN ("postal_codes");

-- CreateIndex
CREATE INDEX "saved_zone_device_id_idx" ON "saved_zone"("device_id");

-- CreateIndex
CREATE INDEX "saved_zone_is_active_idx" ON "saved_zone"("is_active");

-- CreateIndex
CREATE INDEX "saved_zone_gist_idx" ON "saved_zone" USING GIST ("location_point");

-- CreateIndex
CREATE INDEX "sighting_alert_id_idx" ON "sighting"("alert_id");

-- CreateIndex
CREATE INDEX "sighting_reporter_id_idx" ON "sighting"("reporter_id");

-- CreateIndex
CREATE INDEX "sighting_dismissed_idx" ON "sighting"("dismissed");

-- CreateIndex
CREATE INDEX "sighting_location_gist_idx" ON "sighting" USING GIST ("location_point");

-- CreateIndex
CREATE INDEX "notification_alert_id_idx" ON "notification"("alert_id");

-- CreateIndex
CREATE INDEX "notification_device_id_idx" ON "notification"("device_id");

-- CreateIndex
CREATE INDEX "notification_status_idx" ON "notification"("status");

-- CreateIndex
CREATE INDEX "notification_excluded_idx" ON "notification"("excluded");

-- CreateIndex
CREATE INDEX "notification_sent_at_idx" ON "notification"("sent_at");

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_zone" ADD CONSTRAINT "saved_zone_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sighting" ADD CONSTRAINT "sighting_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sighting" ADD CONSTRAINT "sighting_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
