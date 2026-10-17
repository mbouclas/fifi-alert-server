-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "InvitationAcceptedVia" AS ENUM ('TOKEN', 'EMAIL');

-- CreateTable
CREATE TABLE "invitation" (
    "id" SERIAL NOT NULL,
    "sender_user_id" INTEGER NOT NULL,
    "recipient_email" VARCHAR(254) NOT NULL,
    "recipient_name" VARCHAR(120),
    "locale" VARCHAR(5) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "message" TEXT,
    "token_hash" CHAR(64) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "accepted_via" "InvitationAcceptedVia",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "converted_user_id" INTEGER,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_send_log" (
    "id" SERIAL NOT NULL,
    "invitation_id" INTEGER NOT NULL,
    "sender_user_id" INTEGER NOT NULL,
    "recipient_hash" CHAR(64) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" VARCHAR(16) NOT NULL,
    "error" VARCHAR(500),

    CONSTRAINT "invitation_send_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_hash_key" ON "invitation"("token_hash");

-- CreateIndex
CREATE INDEX "invitation_sender_user_id_created_at_idx" ON "invitation"("sender_user_id", "created_at");

-- CreateIndex
CREATE INDEX "invitation_recipient_email_status_idx" ON "invitation"("recipient_email", "status");

-- CreateIndex
CREATE INDEX "invitation_status_expires_at_idx" ON "invitation"("status", "expires_at");

-- CreateIndex
CREATE INDEX "invitation_send_log_sender_user_id_sent_at_idx" ON "invitation_send_log"("sender_user_id", "sent_at");

-- CreateIndex
CREATE INDEX "invitation_send_log_sent_at_idx" ON "invitation_send_log"("sent_at");

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_converted_user_id_fkey" FOREIGN KEY ("converted_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_send_log" ADD CONSTRAINT "invitation_send_log_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_send_log" ADD CONSTRAINT "invitation_send_log_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One open (pending) invitation per sender + recipient address. Prisma cannot
-- express partial indexes, so this lives only here (see schema.prisma comment).
CREATE UNIQUE INDEX "invitation_one_pending_per_sender_recipient_idx" ON "invitation"("sender_user_id", "recipient_email") WHERE "status" = 'PENDING';
