-- Access and refresh JWTs are now stored in session.token as a SHA-256 hex
-- digest (see src/auth/services/token.service.ts hashToken). Hash the existing
-- plaintext rows in place so current logins survive the deploy.
--
-- better-auth's own rows (token_type = 'session') are intentionally left raw:
-- better-auth reads them by value.
UPDATE "session"
SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token_type" IN ('access', 'refresh')
  AND length("token") <> 64;
