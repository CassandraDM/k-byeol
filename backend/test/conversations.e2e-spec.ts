import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * End-to-end coverage of the event group chat: who may manage it, and what the
 * payload tells the app about its own permissions.
 *
 * PrismaService is a double as everywhere else in this suite — the subject is
 * the boundary (guards, pipes, ownership), not the SQL.
 */

const ORGANIZER = 1;
const PARTICIPANT = 2;
const OUTSIDER = 3;
const MODERATOR = 4;
const EVENT_ID = 10;
const CONVERSATION_ID = 100;

/** Roles the stubbed database hands back, keyed by user. */
const ROLES: Record<number, string> = {
  [ORGANIZER]: 'OWNER',
  [PARTICIPANT]: 'MEMBER',
  [MODERATOR]: 'MODERATOR',
};

const member = (id: number, username: string) => ({
  role: ROLES[id],
  isMuted: false,
  mutedUntil: null,
  user: { id, username, avatar: null },
});

/** The event chat as stored: a GROUP carrying an eventId, owned by its host. */
const EVENT_CHAT = {
  id: CONVERSATION_ID,
  type: 'GROUP',
  name: 'Random play dance',
  ownerId: ORGANIZER,
  eventId: EVENT_ID,
  lastMessageText: null,
  lastMessageAt: null,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  participants: [
    member(ORGANIZER, 'Beeko'),
    member(PARTICIPANT, 'Neeko'),
    member(MODERATOR, 'Mimi'),
  ],
};

describe('Event conversations (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    event: { findUnique: jest.Mock };
    conversation: { findUnique: jest.Mock; findMany: jest.Mock };
    conversationParticipant: {
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    block: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  const tokenFor = (id: number) =>
    jwt.sign({ sub: id, email: `user${id}@example.com` });
  const auth = (id: number) => ({ Authorization: `Bearer ${tokenFor(id)}` });

  /**
   * Answers participant lookups by identity rather than call order: the
   * management routes look the actor up as well as the target, so a flat mock
   * would hand the organizer somebody else's role.
   */
  const participantByIdentity = (args: {
    where: { userId_conversationId: { userId: number } };
  }) => {
    const { userId } = args.where.userId_conversationId;
    const role = ROLES[userId];
    if (!role) return Promise.resolve(null);
    return Promise.resolve({ userId, role, isMuted: false, mutedUntil: null });
  };

  beforeAll(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ emailVerified: true }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      event: { findUnique: jest.fn().mockResolvedValue(null) },
      conversation: {
        findUnique: jest.fn().mockResolvedValue(EVENT_CHAT),
        findMany: jest.fn().mockResolvedValue([EVENT_CHAT]),
      },
      conversationParticipant: {
        findUnique: jest.fn(participantByIdentity),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      block: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so the suite tests the deployed configuration.
    app.use(helmet({ contentSecurityPolicy: false }));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    jwt = app.get(JwtService);
    await app.init();
  });

  beforeEach(() => {
    prisma.conversationParticipant.update.mockClear();
    prisma.conversationParticipant.delete.mockClear();
    prisma.conversationParticipant.findUnique.mockImplementation(
      participantByIdentity,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Authentification ────────────────────────────────────────────────────

  describe('authentication', () => {
    it('rejects listing conversations with no token (401)', async () => {
      await request(app.getHttpServer()).get('/conversations').expect(401);
    });

    it('rejects a role change with no token (401)', async () => {
      await request(app.getHttpServer())
        .put(
          `/conversations/${CONVERSATION_ID}/participants/${PARTICIPANT}/role`,
        )
        .send({ role: 'WRITER' })
        .expect(401);
    });
  });

  // ── Ce que la charge utile dit à l'application ──────────────────────────

  describe('GET /conversations', () => {
    it('tells a plain participant they may not write or manage', async () => {
      const res = await request(app.getHttpServer())
        .get('/conversations')
        .set(auth(PARTICIPANT))
        .expect(200);

      const [thread] = res.body as Array<{
        eventId: number | null;
        isRestricted: boolean;
        canWrite: boolean;
        canModerate: boolean;
        canManage: boolean;
        isOwner: boolean;
        myRole: string | null;
      }>;

      expect(thread.eventId).toBe(EVENT_ID);
      expect(thread.isRestricted).toBe(true);
      expect(thread.canWrite).toBe(false);
      expect(thread.canModerate).toBe(false);
      expect(thread.canManage).toBe(false);
      expect(thread.isOwner).toBe(false);
      expect(thread.myRole).toBe('MEMBER');
    });

    it('tells the organizer they may do everything', async () => {
      const res = await request(app.getHttpServer())
        .get('/conversations')
        .set(auth(ORGANIZER))
        .expect(200);

      const [thread] = res.body as Array<{
        canWrite: boolean;
        canModerate: boolean;
        canManage: boolean;
        isOwner: boolean;
      }>;

      expect(thread.canWrite).toBe(true);
      expect(thread.canModerate).toBe(true);
      expect(thread.canManage).toBe(true);
      expect(thread.isOwner).toBe(true);
    });

    it('lets a moderator moderate but not hand out roles', async () => {
      const res = await request(app.getHttpServer())
        .get('/conversations')
        .set(auth(MODERATOR))
        .expect(200);

      const [thread] = res.body as Array<{
        canWrite: boolean;
        canModerate: boolean;
        canManage: boolean;
      }>;

      expect(thread.canWrite).toBe(true);
      expect(thread.canModerate).toBe(true);
      expect(thread.canManage).toBe(false);
    });

    it('answers the same thread differently per viewer', async () => {
      // The permission travels with the reader, not with the row.
      const asOwner = await request(app.getHttpServer())
        .get('/conversations')
        .set(auth(ORGANIZER))
        .expect(200);
      const asMember = await request(app.getHttpServer())
        .get('/conversations')
        .set(auth(PARTICIPANT))
        .expect(200);

      expect((asOwner.body as Array<{ canWrite: boolean }>)[0].canWrite).toBe(
        true,
      );
      expect((asMember.body as Array<{ canWrite: boolean }>)[0].canWrite).toBe(
        false,
      );
    });
  });

  describe('a mute suspends the role it is on', () => {
    /** Answers every participant lookup with a muted moderator. */
    const mutedModerator = () => {
      prisma.conversationParticipant.findUnique.mockImplementation(
        (args: { where: { userId_conversationId: { userId: number } } }) => {
          const { userId } = args.where.userId_conversationId;
          const role = ROLES[userId];
          if (!role) return Promise.resolve(null);
          return Promise.resolve({
            userId,
            role,
            isMuted: userId === MODERATOR,
            mutedUntil: null,
          });
        },
      );
    };

    it('reports a muted moderator as unable to write or moderate', async () => {
      prisma.conversation.findMany.mockResolvedValueOnce([
        {
          ...EVENT_CHAT,
          participants: EVENT_CHAT.participants.map((p) =>
            p.user.id === MODERATOR ? { ...p, isMuted: true } : p,
          ),
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/conversations')
        .set(auth(MODERATOR))
        .expect(200);

      const [thread] = res.body as Array<{
        myRole: string;
        canWrite: boolean;
        canModerate: boolean;
      }>;

      // The stored role is untouched — only what it currently allows changes.
      expect(thread.myRole).toBe('MODERATOR');
      expect(thread.canWrite).toBe(false);
      expect(thread.canModerate).toBe(false);
    });

    it('refuses a muted moderator muting somebody else (403)', async () => {
      mutedModerator();

      await request(app.getHttpServer())
        .post(
          `/conversations/${CONVERSATION_ID}/participants/${PARTICIPANT}/mute`,
        )
        .set(auth(MODERATOR))
        .send({})
        .expect(403);

      expect(prisma.conversationParticipant.update).not.toHaveBeenCalled();
    });

    it('refuses a muted moderator removing somebody (403)', async () => {
      mutedModerator();

      await request(app.getHttpServer())
        .delete(`/conversations/${CONVERSATION_ID}/participants/${PARTICIPANT}`)
        .set(auth(MODERATOR))
        .expect(403);

      expect(prisma.conversationParticipant.delete).not.toHaveBeenCalled();
    });

    it('still lets the organizer lift the mute (200)', async () => {
      // "Removed manually by the people with the right roles to moderate".
      mutedModerator();

      await request(app.getHttpServer())
        .delete(
          `/conversations/${CONVERSATION_ID}/participants/${MODERATOR}/mute`,
        )
        .set(auth(ORGANIZER))
        .expect(200);

      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isMuted: false, mutedUntil: null } }),
      );
    });
  });

  // ── Rôles ───────────────────────────────────────────────────────────────

  describe('PUT /conversations/:id/participants/:userId/role', () => {
    const roleUrl = (userId: number) =>
      `/conversations/${CONVERSATION_ID}/participants/${userId}/role`;

    it.each(['WRITER', 'MODERATOR', 'ADMIN', 'MEMBER'])(
      'lets the organizer assign %s (200)',
      async (role) => {
        await request(app.getHttpServer())
          .put(roleUrl(PARTICIPANT))
          .set(auth(ORGANIZER))
          .send({ role })
          .expect(200);

        expect(prisma.conversationParticipant.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { role } }),
        );
      },
    );

    it('rejects a role outside the assignable set before the service (400)', async () => {
      // OWNER is not assignable — a second owner could demote the first.
      await request(app.getHttpServer())
        .put(roleUrl(PARTICIPANT))
        .set(auth(ORGANIZER))
        .send({ role: 'OWNER' })
        .expect(400);

      expect(prisma.conversationParticipant.update).not.toHaveBeenCalled();
    });

    it('rejects a body with no role at all (400)', async () => {
      await request(app.getHttpServer())
        .put(roleUrl(PARTICIPANT))
        .set(auth(ORGANIZER))
        .send({})
        .expect(400);
    });

    it('refuses a moderator handing out roles (403)', async () => {
      await request(app.getHttpServer())
        .put(roleUrl(PARTICIPANT))
        .set(auth(MODERATOR))
        .send({ role: 'WRITER' })
        .expect(403);

      expect(prisma.conversationParticipant.update).not.toHaveBeenCalled();
    });

    it('refuses a participant promoting themselves (403)', async () => {
      await request(app.getHttpServer())
        .put(roleUrl(PARTICIPANT))
        .set(auth(PARTICIPANT))
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('refuses an outsider entirely (403)', async () => {
      await request(app.getHttpServer())
        .put(roleUrl(PARTICIPANT))
        .set(auth(OUTSIDER))
        .send({ role: 'WRITER' })
        .expect(403);
    });
  });

  // ── Mutes ───────────────────────────────────────────────────────────────

  describe('mute', () => {
    const muteUrl = (userId: number) =>
      `/conversations/${CONVERSATION_ID}/participants/${userId}/mute`;

    it('mutes for a stretch of time (200)', async () => {
      await request(app.getHttpServer())
        .post(muteUrl(PARTICIPANT))
        .set(auth(ORGANIZER))
        .send({ minutes: 60 })
        .expect(200);

      const [arg] = prisma.conversationParticipant.update.mock.calls[0] as [
        { data: { isMuted: boolean; mutedUntil: Date | null } },
      ];
      expect(arg.data.isMuted).toBe(true);
      expect(arg.data.mutedUntil).toBeInstanceOf(Date);
    });

    it('mutes with no end date when the body is empty (200)', async () => {
      await request(app.getHttpServer())
        .post(muteUrl(PARTICIPANT))
        .set(auth(ORGANIZER))
        .send({})
        .expect(200);

      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isMuted: true, mutedUntil: null } }),
      );
    });

    it('rejects a nonsense duration (400)', async () => {
      await request(app.getHttpServer())
        .post(muteUrl(PARTICIPANT))
        .set(auth(ORGANIZER))
        .send({ minutes: -5 })
        .expect(400);

      expect(prisma.conversationParticipant.update).not.toHaveBeenCalled();
    });

    it('lifts a mute (200)', async () => {
      await request(app.getHttpServer())
        .delete(muteUrl(PARTICIPANT))
        .set(auth(ORGANIZER))
        .expect(200);

      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isMuted: false, mutedUntil: null } }),
      );
    });

    it('lets a moderator mute a plain participant (200)', async () => {
      await request(app.getHttpServer())
        .post(muteUrl(PARTICIPANT))
        .set(auth(MODERATOR))
        .send({ minutes: 15 })
        .expect(200);
    });

    it('refuses to mute the organizer (400)', async () => {
      await request(app.getHttpServer())
        .post(muteUrl(ORGANIZER))
        .set(auth(MODERATOR))
        .send({})
        .expect(400);

      expect(prisma.conversationParticipant.update).not.toHaveBeenCalled();
    });

    it('refuses a plain participant muting anyone (403)', async () => {
      await request(app.getHttpServer())
        .post(muteUrl(MODERATOR))
        .set(auth(PARTICIPANT))
        .send({})
        .expect(403);
    });
  });

  // ── Retrait ─────────────────────────────────────────────────────────────

  describe('DELETE /conversations/:id/participants/:userId', () => {
    const kickUrl = (userId: number) =>
      `/conversations/${CONVERSATION_ID}/participants/${userId}`;

    it('lets the organizer remove a participant (200)', async () => {
      await request(app.getHttpServer())
        .delete(kickUrl(PARTICIPANT))
        .set(auth(ORGANIZER))
        .expect(200);

      expect(prisma.conversationParticipant.delete).toHaveBeenCalledWith({
        where: {
          userId_conversationId: {
            userId: PARTICIPANT,
            conversationId: CONVERSATION_ID,
          },
        },
      });
    });

    it('lets a moderator remove somebody below them (200)', async () => {
      await request(app.getHttpServer())
        .delete(kickUrl(PARTICIPANT))
        .set(auth(MODERATOR))
        .expect(200);

      expect(prisma.conversationParticipant.delete).toHaveBeenCalled();
    });

    it('refuses a participant removing anyone (403)', async () => {
      await request(app.getHttpServer())
        .delete(kickUrl(MODERATOR))
        .set(auth(PARTICIPANT))
        .expect(403);

      expect(prisma.conversationParticipant.delete).not.toHaveBeenCalled();
    });

    it('refuses to remove the organizer, even by themselves (400)', async () => {
      await request(app.getHttpServer())
        .delete(kickUrl(ORGANIZER))
        .set(auth(ORGANIZER))
        .expect(400);

      expect(prisma.conversationParticipant.delete).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric id before the service sees it (400)', async () => {
      await request(app.getHttpServer())
        .delete(kickUrl('not-a-number' as unknown as number))
        .set(auth(ORGANIZER))
        .expect(400);
    });

    it('answers 404 for somebody who is not in the thread', async () => {
      await request(app.getHttpServer())
        .delete(kickUrl(OUTSIDER))
        .set(auth(ORGANIZER))
        .expect(404);
    });
  });
});
