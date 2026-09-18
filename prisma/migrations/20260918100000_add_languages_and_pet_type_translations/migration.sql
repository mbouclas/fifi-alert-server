-- Multilingual pet types
--
-- 1. Create the `language` table (registry of UI languages + default)
-- 2. Create `pet_type_translation` (one display name per pet type per language)
-- 3. Copy existing pet_type.name into the `en` translation
-- 4. Seed Greek (`el`, the default language) translations for the known pet types
-- 5. Drop pet_type.name (slug remains the stable key)

-- 1. language ---------------------------------------------------------------
CREATE TABLE "language" (
    "code"        VARCHAR(8)   NOT NULL,
    "name"        VARCHAR(100) NOT NULL,
    "native_name" VARCHAR(100) NOT NULL,
    "is_default"  BOOLEAN      NOT NULL DEFAULT false,
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "sort_order"  INTEGER      NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "language_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "language_is_active_sort_order_idx" ON "language"("is_active", "sort_order");

-- Guarantee at most one default language.
CREATE UNIQUE INDEX "language_single_default_idx" ON "language"("is_default") WHERE "is_default";

INSERT INTO "language" ("code", "name", "native_name", "is_default", "is_active", "sort_order", "updated_at") VALUES
('el', 'Greek',   'Ελληνικά', true,  true, 10, CURRENT_TIMESTAMP),
('en', 'English', 'English',  false, true, 20, CURRENT_TIMESTAMP);

-- 2. pet_type_translation ---------------------------------------------------
CREATE TABLE "pet_type_translation" (
    "id"          SERIAL       NOT NULL,
    "pet_type_id" INTEGER      NOT NULL,
    "lang_code"   VARCHAR(8)   NOT NULL,
    "name"        VARCHAR(100) NOT NULL,

    CONSTRAINT "pet_type_translation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pet_type_translation_pet_type_id_lang_code_key" ON "pet_type_translation"("pet_type_id", "lang_code");
CREATE INDEX "pet_type_translation_lang_code_name_idx" ON "pet_type_translation"("lang_code", "name");

ALTER TABLE "pet_type_translation"
    ADD CONSTRAINT "pet_type_translation_pet_type_id_fkey"
    FOREIGN KEY ("pet_type_id") REFERENCES "pet_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pet_type_translation"
    ADD CONSTRAINT "pet_type_translation_lang_code_fkey"
    FOREIGN KEY ("lang_code") REFERENCES "language"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Existing English names become the `en` translation -----------------------
INSERT INTO "pet_type_translation" ("pet_type_id", "lang_code", "name")
SELECT "id", 'en', "name" FROM "pet_type";

-- 4. Greek translations for the known pet types (matched by slug) --------------
INSERT INTO "pet_type_translation" ("pet_type_id", "lang_code", "name")
SELECT pt."id", 'el', v."name"
FROM "pet_type" pt
JOIN (VALUES
    ('dog',        'Σκύλος'),
    ('cat',        'Γάτα'),
    ('bird',       'Πουλί'),
    ('rabbit',     'Κουνέλι'),
    ('hamster',    'Χάμστερ'),
    ('guinea-pig', 'Ινδικό Χοιρίδιο'),
    ('ferret',     'Κουνάβι'),
    ('turtle',     'Χελώνα'),
    ('lizard',     'Σαύρα'),
    ('snake',      'Φίδι'),
    ('fish',       'Ψάρι'),
    ('other',      'Άλλο')
) AS v("slug", "name") ON v."slug" = pt."slug"
ON CONFLICT ("pet_type_id", "lang_code") DO NOTHING;

-- Any pet type without a Greek row (custom types) falls back to its English name
-- so the default language always resolves.
INSERT INTO "pet_type_translation" ("pet_type_id", "lang_code", "name")
SELECT pt."id", 'el', pt."name"
FROM "pet_type" pt
WHERE NOT EXISTS (
    SELECT 1 FROM "pet_type_translation" t
    WHERE t."pet_type_id" = pt."id" AND t."lang_code" = 'el'
);

-- 5. Drop the single-language column --------------------------------------------
DROP INDEX IF EXISTS "pet_type_name_key";
DROP INDEX IF EXISTS "pet_type_name_idx";
ALTER TABLE "pet_type" DROP COLUMN "name";
