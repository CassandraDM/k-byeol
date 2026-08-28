import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * End-to-end coverage of the follow endpoints, through the real HTTP stack:
 * guard, pipes, controller and service all run.
 *
 * As everywhere else in this suite PrismaService is a double — what is under
 * test is the *boundary* (who may call what, with which ids), not the SQL.
 */

const ME = 1;
const THEM = 2;

/** A follow row as Prisma hands it back. */
const EDGE = { createdAt: new Date('2026-08-01T10:00:00.000Z') };

describe('Follows (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let prisma: {
    user: { findUnique: jest.Mock };
    follow: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
    block: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  /** Signs a token the real JwtAuthGuard will accept. */
  const tokenFor = (id: number) =>
    jwt.sign({ sub: id, email: `user${id}@example.com` });

  const auth = (id: number) => ({ Authorization: `Bearer ${tokenFor(id)}` });

  beforeAll(async () => {
    prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: THEM, emailVerified: true }),
      },
      follow: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      // Nobody is blocked unless a test says otherwise.
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

  // Only the call history is reset — the resolved values above are the fixture,
  // and each test overrides what it needs with `Once`.
  beforeEach(() => {
    prisma.follow.upsert.mockClear();
    prisma.follow.deleteMany.mockClear();
    prisma.follow.findMany.mockClear();
    prisma.follow.findUnique.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Authentification ────────────────────────────────────────────────────

  describe('authentication', () => {
    it('rejects following with no token (401)', async () => {
      await request(app.getHttpServer())
        .post(`/users/${THEM}/follow`)
        .expect(401);
    });

    it('rejects reading your following list with no token (401)', async () => {
      await request(app.getHttpServer()).get('/users/me/following').expect(401);
    });

    it('rejects a token signed with another secret (401)', async () => {
      const forged = new JwtService({
        secret: 'a-completely-different-secret',
      }).sign({ sub: ME, email: 'a@b.com' });

      await request(app.getHttpServer())
        .post(`/users/${THEM}/follow`)
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });
  });

  // ── Validation des entrées ──────────────────────────────────────────────

  describe('input validation', () => {
    it('rejects a non-numeric id before it reaches the service (400)', async () => {
      await request(app.getHttpServer())
        .post('/users/not-a-number/follow')
        .set(auth(ME))
        .expect(400);

      expect(prisma.follow.upsert).not.toHaveBeenCalled();
    });

    it('refuses a self-follow (400)', async () => {
      await request(app.getHttpServer())
        .post(`/users/${ME}/follow`)
        .set(auth(ME))
        .expect(400);

      expect(prisma.follow.upsert).not.toHaveBeenCalled();
    });

    it('refuses a self-unfollow (400)', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${ME}/follow`)
        .set(auth(ME))
        .expect(400);
    });
  });

  // ── Follow / unfollow ───────────────────────────────────────────────────

  describe('POST /users/:id/follow', () => {
    it('follows and answers with the new relationship (200)', async () => {
      prisma.follow.findUnique
        .mockResolvedValueOnce(EDGE) // me → them
        .mockResolvedValueOnce(null); // them → me
      prisma.follow.count
        .mockResolvedValueOnce(4) // their followers
        .mockResolvedValueOnce(7); // who they follow

      const res = await request(app.getHttpServer())
        .post(`/users/${THEM}/follow`)
        .set(auth(ME))
        .expect(200);

      expect(res.body).toEqual({
        isFollowing: true,
        followsYou: false,
        isFriend: false,
        followerCount: 4,
        followingCount: 7,
      });
    });

    it('takes the follower from the token, never from the URL', async () => {
      await request(app.getHttpServer())
        .post(`/users/${THEM}/follow`)
        .set(auth(ME))
        .expect(200);

      expect(prisma.follow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            followerId_followingId: { followerId: ME, followingId: THEM },
          },
        }),
      );
    });

    it('answers 404 for a user who does not exist', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post('/users/999/follow')
        .set(auth(ME))
        .expect(404);
    });

    it('answers 404 — not 403 — when a block separates the two', async () => {
      // Saying "you are blocked" would confirm the block exists.
      prisma.block.findFirst.mockResolvedValueOnce({ blockerId: THEM });

      await request(app.getHttpServer())
        .post(`/users/${THEM}/follow`)
        .set(auth(ME))
        .expect(404);

      expect(prisma.follow.upsert).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /users/:id/follow', () => {
    it('unfollows and reports the relationship as ended (200)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/users/${THEM}/follow`)
        .set(auth(ME))
        .expect(200);

      expect(prisma.follow.deleteMany).toHaveBeenCalledWith({
        where: { followerId: ME, followingId: THEM },
      });
      expect(res.body).toMatchObject({ isFollowing: false, isFriend: false });
    });
  });

  // ── Listes ──────────────────────────────────────────────────────────────

  describe('GET /users/me/following', () => {
    it('lists the signed-in user and marks mutuals as friends (200)', async () => {
      prisma.follow.findMany
        .mockResolvedValueOnce([
          {
            createdAt: EDGE.createdAt,
            following: {
              id: THEM,
              username: 'Mimi',
              avatar: null,
              bio: 'ATEEZ 4ever',
            },
          },
        ])
        .mockResolvedValueOnce([{ followerId: THEM }]);

      const res = await request(app.getHttpServer())
        .get('/users/me/following')
        .set(auth(ME))
        .expect(200);

      expect(prisma.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { followerId: ME } }),
      );
      // The `me` route answers with the bare list, not the `{ count, … }`
      // envelope the `:id` routes use.
      expect(res.body).toEqual([
        expect.objectContaining({ id: THEM, username: 'Mimi', isFriend: true }),
      ]);
    });
  });

  describe('GET /users/:id/following', () => {
    it('returns who another profile follows, count included (200)', async () => {
      prisma.follow.findMany
        .mockResolvedValueOnce([
          {
            createdAt: EDGE.createdAt,
            following: { id: 3, username: 'Yuna', avatar: null, bio: null },
          },
        ])
        .mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .get(`/users/${THEM}/following`)
        .set(auth(ME))
        .expect(200);

      expect(prisma.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { followerId: THEM } }),
      );

      const body = res.body as { count: number; following: unknown[] };
      expect(body.count).toBe(1);
      expect(body.following).toEqual([
        expect.objectContaining({ id: 3, username: 'Yuna' }),
      ]);
    });

    it('answers 404 when a block separates viewer and profile', async () => {
      prisma.block.findFirst.mockResolvedValueOnce({ blockerId: THEM });

      await request(app.getHttpServer())
        .get(`/users/${THEM}/following`)
        .set(auth(ME))
        .expect(404);
    });

    it('does not mistake the literal "me" for an id (400)', async () => {
      // `/users/me/following` is its own route; `:id` must stay numeric.
      await request(app.getHttpServer())
        .get('/users/not-a-number/following')
        .set(auth(ME))
        .expect(400);
    });
  });

  describe('GET /users/:id/followers', () => {
    it('returns the count alongside the list (200)', async () => {
      prisma.follow.findMany
        .mockResolvedValueOnce([
          {
            createdAt: EDGE.createdAt,
            follower: { id: 3, username: 'Yuna', avatar: null, bio: null },
          },
        ])
        .mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .get(`/users/${THEM}/followers`)
        .set(auth(ME))
        .expect(200);

      // Stating the shape keeps the assertions type-checked instead of
      // silently passing on `undefined`.
      const body = res.body as { count: number; followers: unknown[] };
      expect(body.count).toBe(1);
      expect(body.followers).toEqual([
        expect.objectContaining({ id: 3, username: 'Yuna', isFriend: false }),
      ]);
    });

    it('answers 404 when a block separates viewer and profile', async () => {
      prisma.block.findFirst.mockResolvedValueOnce({ blockerId: THEM });

      await request(app.getHttpServer())
        .get(`/users/${THEM}/followers`)
        .set(auth(ME))
        .expect(404);
    });
  });
});
