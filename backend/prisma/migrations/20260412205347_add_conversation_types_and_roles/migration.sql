/*
  Warnings:

  - You are about to drop the column `is_group` on the `conversations` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('PRIVATE', 'GROUP', 'CREW');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('MEMBER', 'WRITER', 'OWNER');

-- AlterTable
ALTER TABLE "conversation_participants" ADD COLUMN     "role" "ParticipantRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "conversations" DROP COLUMN "is_group",
ADD COLUMN     "owner_id" INTEGER,
ADD COLUMN     "type" "ConversationType" NOT NULL DEFAULT 'PRIVATE';

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
