-- A fourth role between WRITER and OWNER: may post, and may set other
-- people's roles — everyone's but the owner's.
--
-- Declared AFTER 'WRITER' so the type's value order matches the schema.
-- Adding a value is allowed inside a transaction on PostgreSQL 12+ as long as
-- nothing uses it in the same transaction, which is why no backfill runs here.
ALTER TYPE "ParticipantRole" ADD VALUE IF NOT EXISTS 'ADMIN' AFTER 'WRITER';
