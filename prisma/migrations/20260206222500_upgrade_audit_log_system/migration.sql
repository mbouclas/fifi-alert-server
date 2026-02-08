/*
  Warnings:

  - Added the required column `eventType` to the `audit_log` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ACCESS', 'EXPORT', 'IMPORT', 'APPROVAL', 'REJECTION', 'SEND', 'RECEIVE', 'ACTIVATION', 'DEACTIVATION', 'ROTATION', 'REVOCATION', 'RESET', 'FAILURE', 'SUCCESS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('USER', 'ALERT', 'SIGHTING', 'DEVICE', 'SAVED_ZONE', 'NOTIFICATION', 'SESSION', 'ROLE', 'GATE', 'EMAIL', 'LOCATION', 'SYSTEM');

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "actor_type" VARCHAR(50),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "entityId" INTEGER,
ADD COLUMN     "entityType" "AuditEntityType",
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "error_stack" TEXT,
ADD COLUMN     "eventType" "AuditEventType" NOT NULL,
ADD COLUMN     "new_values" JSONB,
ADD COLUMN     "old_values" JSONB,
ADD COLUMN     "request_id" VARCHAR(64),
ADD COLUMN     "session_id" VARCHAR(255),
ADD COLUMN     "success" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "actor_id" SET DATA TYPE VARCHAR(100);

-- CreateIndex
CREATE INDEX "audit_log_eventType_timestamp_idx" ON "audit_log"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_timestamp_idx" ON "audit_log"("entityType", "entityId", "timestamp");

-- CreateIndex
CREATE INDEX "audit_log_user_id_timestamp_idx" ON "audit_log"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_actor_type_timestamp_idx" ON "audit_log"("actor_id", "actor_type", "timestamp");

-- CreateIndex
CREATE INDEX "audit_log_success_timestamp_idx" ON "audit_log"("success", "timestamp");

-- CreateIndex
CREATE INDEX "audit_log_session_id_idx" ON "audit_log"("session_id");

-- CreateIndex
CREATE INDEX "audit_log_action_timestamp_idx" ON "audit_log"("action", "timestamp");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
