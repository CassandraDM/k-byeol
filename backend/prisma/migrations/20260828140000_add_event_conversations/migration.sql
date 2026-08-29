-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "event_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "conversations_event_id_key" ON "conversations"("event_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
