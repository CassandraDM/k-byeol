-- Mutes are kept apart from the role so silencing somebody does not cost them
-- the rights they were given. `muted_until` NULL while `is_muted` is true is a
-- mute with no end date; a timestamp lifts itself without any sweep.
ALTER TABLE "conversation_participants"
    ADD COLUMN "is_muted" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "muted_until" TIMESTAMP(3);

-- Soft delete: the row survives moderation so the audit trail does, while the
-- text stops being served.
ALTER TABLE "messages"
    ADD COLUMN "deleted_at" TIMESTAMP(3),
    ADD COLUMN "deleted_by_id" INTEGER;

ALTER TABLE "messages" ADD CONSTRAINT "messages_deleted_by_id_fkey"
    FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
