import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * End-to-end coverage of editing and deleting messages through the real HTTP
 * stack: guard, pipes, controller and service all run.
 *
 * PrismaService is a double as everywhere else in this suite. The socket
 * broadcast is not exercised here — the gateway is stubbed — but the routes
 * are, which is what the permission rules hang off.
 */

const AUTHOR = 1;
const OTHER = 2;
const MODERATOR = 3;
const CONVERSATION_ID = 100;
const MESSAGE_ID = 900;

const ROLES: Record<number, string> = {
  [AUTHOR]: 'MEMBER',
  [OTHER]: 'MEMBER',
  [MODERATOR]: 'MODERATOR',
};

describe('Messages (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let prisma: {
    user: { findUnique: jest.Mock };
    message: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    conversationParticipant: { findUnique: jest.Mock };
    conversation: { update: jest.Mock };
    block: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  const tokenFor = (id: number) =>
    jwt.sign({ sub: id, email: `user${id}@example.com` });
  const auth = (id: number) => ({ Authorization: `Bearer ${tokenFor(id)}` });

  /** The stored message, owned by AUTHOR in an organizer-controlled thread. */
  const storedMessage = (
    overrides: { senderId?: number; deletedAt?: Date | null } = {},
  ) => ({
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: overrides.senderId ?? AUTHOR,
    deletedAt: overrides.deletedAt ?? null,
    conversation: { type: 'GROUP', eventId: 10 },
  });

  beforeAll(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ emailVerified: true }),
      },
      message: {
        findUnique: jest.fn().mockResolvedValue(storedMessage()),
        findFirst: jest.fn().mockResolvedValue({ id: MESSAGE_ID }),
        update: jest.fn().mockResolvedValue({
          id: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          text: 'rewritten',
          editedAt: new Date('2026-08-28T12:00:00.000Z'),
          deletedAt: new Date('2026-08-28T12:00:00.000Z'),
          sender: { id: AUTHOR, username: 'Beeko', avatar: null },
        }),
      },
      conversationParticipant: {
        findUnique: jest.fn(
          (args: { where: { userId_conversationId: { userId: number } } }) => {
            const { userId } = args.where.userId_conversationId;
            const role = ROLES[userId];
            if (!role) return Promise.resolve(null);
            return Promise.resolve({
              userId,
              role,
              isMuted: false,
              mutedUntil: null,
            });
          },
        ),
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
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
    prisma.message.update.mockClear();
    prisma.conversation.update.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Authentification ────────────────────────────────────────────────────

  describe('authentication', () => {
    it('rejects an edit with no token (401)', async () => {
      await request(app.getHttpServer())
        .patch(`/messages/${MESSAGE_ID}`)
        .send({ text: 'rewritten' })
        .expect(401);
    });

    it('rejects a delete with no token (401)', async () => {
      await request(app.getHttpServer())
        .delete(`/messages/${MESSAGE_ID}`)
        .expect(401);
    });

    it('rejects a token signed with another secret (401)', async () => {
      const forged = new JwtService({
        secret: 'a-completely-different-secret',
      }).sign({ sub: AUTHOR, email: 'a@b.com' });

      await request(app.getHttpServer())
        .patch(`/messages/${MESSAGE_ID}`)
        .set('Authorization', `Bearer ${forged}`)
        .send({ text: 'rewritten' })
        .expect(401);
    });
  });

  // ── PATCH /messages/:id ─────────────────────────────────────────────────

  describe('PATCH /messages/:id', () => {
    it('rewrites the author’s own message (200)', async () => {
      await request(app.getHttpServer())
        .patch(`/messages/${MESSAGE_ID}`)
        .set(auth(AUTHOR))
        .send({ text: 'rewritten' })
        .expect(200);

      const [arg] = prisma.message.update.mock.calls[0] as [
        { data: { text: string; editedAt: Date } },
      ];
      expect(arg.data.text).toBe('rewritten');
      expect(arg.data.editedAt).toBeInstanceOf(Date);
    });

    it('takes the author from the token, never from the body', async () => {
      await request(app.getHttpServer())
        .patch(`/messages/${MESSAGE_ID}`)
        .set(auth(OTHER))
        .send({ text: 'rewritten', senderId: AUTHOR })
        // `senderId` is not on the DTO, so whitelisting rejects it outright.
        .expect(400);

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('refuses to rewrite somebody else’s message (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/messages/${MESSAGE_ID}`)
        .set(auth(OTHER))
        .send({ text: 'rewritten' })
        .expect(403);

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('refuses even a moderator (403)', async () => {
      // Deleting is moderation; putting words in somebody's mouth is not.
      await request(app.getHttpServer())
        .patch(`/messages/${MESSAGE_ID}`)
        .set(auth(MODERATOR))
        .send({ text: 'rewritten' })
        .expect(403);
    });

    it('refuses to edit a deleted message (403)', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(
        storedMessage({ deletedAt: new Date() }),
      );

      await request(app.getHttpServer())
        .patch(`/messages/${MESSAGE_ID}`)
        .set(auth(AUTHOR))
        .send({ text: 'rewritten' })
        .expect(403);
    });

    it('rejects an empty message (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/messages/${MESSAGE_ID}`)
        .set(auth(AUTHOR))
        .send({ text: '' })
        .expect(400);

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('rejects a message past the length ceiling (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/messages/${MESSAGE_ID}`)
        .set(auth(AUTHOR))
        .send({ text: 'x'.repeat(2001) })
        .expect(400);
    });

    it('rejects a non-numeric id before the service sees it (400)', async () => {
      await request(app.getHttpServer())
        .patch('/messages/not-a-number')
        .set(auth(AUTHOR))
        .send({ text: 'rewritten' })
        .expect(400);
    });

    it('answers 404 for a message that does not exist', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .patch(`/messages/${MESSAGE_ID}`)
        .set(auth(AUTHOR))
        .send({ text: 'rewritten' })
        .expect(404);
    });
  });

  // ── DELETE /messages/:id ────────────────────────────────────────────────

  describe('DELETE /messages/:id', () => {
    it('lets the author take back their own message (200)', async () => {
      await request(app.getHttpServer())
        .delete(`/messages/${MESSAGE_ID}`)
        .set(auth(AUTHOR))
        .expect(200);

      const [arg] = prisma.message.update.mock.calls[0] as [
        { data: { deletedAt: Date; deletedById: number } },
      ];
      expect(arg.data.deletedById).toBe(AUTHOR);
    });

    it('refuses a plain participant deleting somebody else’s (403)', async () => {
      await request(app.getHttpServer())
        .delete(`/messages/${MESSAGE_ID}`)
        .set(auth(OTHER))
        .expect(403);

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('lets a moderator delete somebody else’s (200)', async () => {
      // Broader than the ticket's "own messages only", kept from #43.
      await request(app.getHttpServer())
        .delete(`/messages/${MESSAGE_ID}`)
        .set(auth(MODERATOR))
        .expect(200);

      expect(prisma.message.update).toHaveBeenCalled();
    });

    it('refuses somebody outside the conversation (403)', async () => {
      await request(app.getHttpServer())
        .delete(`/messages/${MESSAGE_ID}`)
        .set(auth(99))
        .expect(403);
    });

    it('answers 404 for a message that does not exist', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .delete(`/messages/${MESSAGE_ID}`)
        .set(auth(AUTHOR))
        .expect(404);
    });

    it('restores a message for whoever deleted it (200)', async () => {
      prisma.message.findUnique.mockResolvedValueOnce({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        deletedAt: new Date('2026-08-28T12:00:00.000Z'),
        deletedById: AUTHOR,
      });

      await request(app.getHttpServer())
        .post(`/messages/${MESSAGE_ID}/restore`)
        .set(auth(AUTHOR))
        .expect(200);

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: null, deletedById: null },
        }),
      );
    });

    it('refuses to let anyone else undo it (403)', async () => {
      // An author must not be able to reinstate a moderator's deletion.
      prisma.message.findUnique.mockResolvedValueOnce({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        deletedAt: new Date('2026-08-28T12:00:00.000Z'),
        deletedById: MODERATOR,
      });

      await request(app.getHttpServer())
        .post(`/messages/${MESSAGE_ID}/restore`)
        .set(auth(AUTHOR))
        .expect(403);

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('refuses to restore a message that was never deleted (400)', async () => {
      await request(app.getHttpServer())
        .post(`/messages/${MESSAGE_ID}/restore`)
        .set(auth(AUTHOR))
        .expect(400);
    });

    it('reports success for an already-deleted message (200)', async () => {
      const already = new Date('2026-08-28T10:00:00.000Z');
      prisma.message.findUnique.mockResolvedValueOnce(
        storedMessage({ deletedAt: already }),
      );

      await request(app.getHttpServer())
        .delete(`/messages/${MESSAGE_ID}`)
        .set(auth(AUTHOR))
        .expect(200);

      expect(prisma.message.update).not.toHaveBeenCalled();
    });
  });
});
