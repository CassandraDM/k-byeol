-- Set the first time an author rewrites their message, so the thread can show
-- that what is on screen is not what was originally sent. NULL means the
-- message has never been edited.
ALTER TABLE "messages" ADD COLUMN "edited_at" TIMESTAMP(3);
