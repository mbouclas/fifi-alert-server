-- Data migration: grant the default `user` role to every account that has no
-- role at all. The public signup flow created users via Better Auth without
-- touching "UserRole"; the signup handler now assigns the role, this backfills
-- the accounts created before that fix.
--
-- Idempotent: only inserts for users with zero UserRole rows.
-- "updated_at" is set explicitly because Prisma's @updatedAt has no DB default.
INSERT INTO "UserRole" ("user_id", "role_id", "created_at", "updated_at")
SELECT u."id", r."id", now(), now()
FROM "user" u
CROSS JOIN "Role" r
WHERE r."slug" = 'user'
  AND r."active" = true
  AND NOT EXISTS (
    SELECT 1 FROM "UserRole" ur WHERE ur."user_id" = u."id"
  );
