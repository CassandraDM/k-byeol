-- Account deletion (#44).
--
-- The account row survives deletion so the messages it authored keep a sender
-- and other people's threads stay readable. What leaves at once is the
-- identity: `email` and `username` are overwritten with reserved values and
-- their originals move to `restore_email` / `restore_username`. That frees the
-- address for a new signup immediately, while support can still put the
-- account back during the grace period. Clearing those two columns is what
-- makes a deletion irreversible, and it is all the purge sweep does.
ALTER TABLE "users"
    ADD COLUMN "deleted_at" TIMESTAMP(3),
    ADD COLUMN "restore_email" VARCHAR(100),
    ADD COLUMN "restore_username" VARCHAR(50);

-- The purge sweep asks for deleted accounts past the grace period, and every
-- read of a live account has to rule deletion out.
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
