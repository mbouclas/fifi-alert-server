-- CreateTable: pet_type
CREATE TABLE "pet_type" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pet_type_name_key" ON "pet_type"("name");
CREATE UNIQUE INDEX "pet_type_slug_key" ON "pet_type"("slug");
CREATE INDEX "pet_type_slug_idx" ON "pet_type"("slug");
CREATE INDEX "pet_type_name_idx" ON "pet_type"("name");

-- Insert default pet types (Order matters - we need id=1 for "Other" as default)
INSERT INTO "pet_type" ("name", "slug", "updated_at") VALUES
('Other', 'other', CURRENT_TIMESTAMP),
('Dog', 'dog', CURRENT_TIMESTAMP),
('Cat', 'cat', CURRENT_TIMESTAMP),
('Bird', 'bird', CURRENT_TIMESTAMP),
('Rabbit', 'rabbit', CURRENT_TIMESTAMP),
('Hamster', 'hamster', CURRENT_TIMESTAMP),
('Guinea Pig', 'guinea-pig', CURRENT_TIMESTAMP),
('Ferret', 'ferret', CURRENT_TIMESTAMP),
('Turtle', 'turtle', CURRENT_TIMESTAMP),
('Lizard', 'lizard', CURRENT_TIMESTAMP),
('Snake', 'snake', CURRENT_TIMESTAMP),
('Fish', 'fish', CURRENT_TIMESTAMP);

-- Add pet_type_id column with default value of 1 (Other)
ALTER TABLE "pet" ADD COLUMN "pet_type_id" INTEGER NOT NULL DEFAULT 1;

-- Migrate existing data: Map old enum values to new pet_type_id
-- This handles the 4 existing rows in the pet table
UPDATE "pet" SET "pet_type_id" = (
    CASE 
        WHEN "type" = 'DOG' THEN (SELECT id FROM "pet_type" WHERE slug = 'dog')
        WHEN "type" = 'CAT' THEN (SELECT id FROM "pet_type" WHERE slug = 'cat')
        WHEN "type" = 'BIRD' THEN (SELECT id FROM "pet_type" WHERE slug = 'bird')
        WHEN "type" = 'RABBIT' THEN (SELECT id FROM "pet_type" WHERE slug = 'rabbit')
        WHEN "type" = 'HAMSTER' THEN (SELECT id FROM "pet_type" WHERE slug = 'hamster')
        WHEN "type" = 'GUINEA_PIG' THEN (SELECT id FROM "pet_type" WHERE slug = 'guinea-pig')
        WHEN "type" = 'FERRET' THEN (SELECT id FROM "pet_type" WHERE slug = 'ferret')
        WHEN "type" = 'TURTLE' THEN (SELECT id FROM "pet_type" WHERE slug = 'turtle')
        WHEN "type" = 'LIZARD' THEN (SELECT id FROM "pet_type" WHERE slug = 'lizard')
        WHEN "type" = 'SNAKE' THEN (SELECT id FROM "pet_type" WHERE slug = 'snake')
        WHEN "type" = 'FISH' THEN (SELECT id FROM "pet_type" WHERE slug = 'fish')
        WHEN "type" = 'OTHER' THEN (SELECT id FROM "pet_type" WHERE slug = 'other')
        ELSE (SELECT id FROM "pet_type" WHERE slug = 'other')
    END
) WHERE "type" IS NOT NULL;

-- Drop the old type column
ALTER TABLE "pet" DROP COLUMN "type";

-- Remove the default (we want application-level validation, not db-level default)
ALTER TABLE "pet" ALTER COLUMN "pet_type_id" DROP DEFAULT;

-- Add foreign key constraint
ALTER TABLE "pet" ADD CONSTRAINT "pet_pet_type_id_fkey" FOREIGN KEY ("pet_type_id") REFERENCES "pet_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex on pet.pet_type_id for FK performance
CREATE INDEX "pet_pet_type_id_idx" ON "pet"("pet_type_id");

-- Drop the old PetType enum (if it exists and is no longer used)
DROP TYPE IF EXISTS "PetType";
