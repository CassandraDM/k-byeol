-- A role between WRITER and ADMIN: may post, delete anyone's messages, and
-- mute or remove people below them — but may not hand out roles.
--
-- Declared AFTER 'WRITER' so the type's value order matches the schema.
-- Alone in its own migration on purpose: PostgreSQL refuses to use a new enum
-- value in the same transaction that adds it, so nothing here may reference it.
ALTER TYPE "ParticipantRole" ADD VALUE IF NOT EXISTS 'MODERATOR' AFTER 'WRITER';
