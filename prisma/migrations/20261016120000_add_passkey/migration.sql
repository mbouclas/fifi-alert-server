-- WebAuthn passkeys: one row per registered authenticator.
-- public_key / counter / credential_id are server-side only.
CREATE TABLE "passkey" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aaguid" TEXT NOT NULL,
    "device_type" TEXT NOT NULL,
    "backed_up" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passkey_credential_id_key" ON "passkey"("credential_id");

CREATE INDEX "passkey_user_id_idx" ON "passkey"("user_id");

ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
