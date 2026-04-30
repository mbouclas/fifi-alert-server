-- AlterTable
ALTER TABLE "pet_type" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Backfill the built-in pet type catalog with the initial display order.
UPDATE "pet_type"
SET "sort_order" = CASE "slug"
	WHEN 'dog' THEN 10
	WHEN 'cat' THEN 20
	WHEN 'bird' THEN 30
	WHEN 'rabbit' THEN 40
	WHEN 'hamster' THEN 50
	WHEN 'guinea-pig' THEN 60
	WHEN 'ferret' THEN 70
	WHEN 'turtle' THEN 80
	WHEN 'lizard' THEN 90
	WHEN 'snake' THEN 100
	WHEN 'fish' THEN 110
	WHEN 'other' THEN 120
	ELSE "sort_order"
END;

-- CreateIndex
CREATE INDEX "pet_type_sort_order_idx" ON "pet_type"("sort_order");
