-- Data migration: every event that predates the group-chat feature gets its
-- thread, with the organiser at the helm and everyone already signed up in it.
--
-- Without this, an old event only grows a chat when somebody *new* joins, and
-- its existing participants would never be added at all.

-- 1. One conversation per event that has none.
INSERT INTO "conversations" ("type", "name", "event_id", "owner_id", "created_at", "updated_at")
SELECT
    'GROUP'::"ConversationType",
    e."title",
    e."id",
    e."organizer_id",
    NOW(),
    NOW()
FROM "events" e
LEFT JOIN "conversations" c ON c."event_id" = e."id"
WHERE c."id" IS NULL
ON CONFLICT ("event_id") DO NOTHING;

-- 2. The organiser owns the thread. Inserted before the participants below so
--    an organiser who also signed up keeps OWNER instead of landing as MEMBER.
INSERT INTO "conversation_participants" ("user_id", "conversation_id", "role")
SELECT e."organizer_id", c."id", 'OWNER'::"ParticipantRole"
FROM "conversations" c
JOIN "events" e ON e."id" = c."event_id"
WHERE c."event_id" IS NOT NULL
ON CONFLICT ("user_id", "conversation_id") DO NOTHING;

-- 3. Everyone already attending joins read-only, the same as a fresh join.
INSERT INTO "conversation_participants" ("user_id", "conversation_id", "role")
SELECT p."user_id", c."id", 'MEMBER'::"ParticipantRole"
FROM "event_participations" p
JOIN "conversations" c ON c."event_id" = p."event_id"
ON CONFLICT ("user_id", "conversation_id") DO NOTHING;
