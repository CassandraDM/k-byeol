-- Reversible account deletion (#44).
--
-- Deleting stops destroying anything. `deleted_at` alone hides the account and
-- everything it owns, so reactivating is a matter of clearing it again, and the
-- purge sweep at the end of the grace period is what finally makes the deletion
-- real.
--
-- The avatar and bio join the email and username in the restore columns: the
-- live ones are emptied so no list has to remember to blank out a deleted
-- user's name or face, and putting all four back is the whole of a
-- reactivation.
ALTER TABLE "users"
    ADD COLUMN "restore_avatar" VARCHAR(255),
    ADD COLUMN "restore_bio" TEXT;
