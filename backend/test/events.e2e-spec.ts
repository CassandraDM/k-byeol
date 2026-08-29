import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * End-to-end coverage of the events endpoints — the application's main
 * feature — exercised through the real HTTP stack: guards, ValidationPipe,
 * pipes and controllers all run.
 *
 * PrismaService is replaced by an in-memory double, so the suite needs no
 * database and stays reproducible. What is under test here is the *boundary*
 * of the API (authentication, authorisation, input validation), not the SQL.
 */

const ORGANIZER = 1;
const OTHER_USER = 2;

/** A stored event owned by ORGANIZER. */
const STORED_EVENT = {
  id: 10,
  title: 'Random play dance',
  type: 'RANDOM_PLAY_DANCE',
  latitude: 44.8378,
  longitude: -0.5792,
  address: 'Place de la Bourse, Bordeaux',
  date: new Date('2026-09-14T00:00:00.000Z'),
  time: '15:00',
  description: 'Bring your best moves.',
  imageUrl: null,
  organizerId: ORGANIZER,
  reminderSentAt: null,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-01T10:00:00.000Z'),
};

describe('Events (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let prisma: {
    $queryRaw: jest.Mock;
    user: { findUnique: jest.Mock };
    userPreferences: { findUnique: jest.Mock };
    event: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    eventParticipation: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    block: { findMany: jest.Mock; findFirst: jest.Mock };
    follow: { findMany: jest.Mock };
    deviceToken: { findMany: jest.Mock };
    conversation: { findUnique: jest.Mock; create: jest.Mock };
    conversationParticipant: { findUnique: jest.Mock; create: jest.Mock };
  };

  /** Signs a token the real JwtAuthGuard will accept. */
  const tokenFor = (id: number) =>
    jwt.sign({ sub: id, email: `user${id}@example.com` });

  beforeAll(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      // Every authenticated user is verified unless a test says otherwise.
      user: {
        findUnique: jest.fn().mockResolvedValue({ emailVerified: true }),
      },
      userPreferences: {
        findUnique: jest.fn().mockResolvedValue({ hideBlockedEvents: true }),
      },
      event: {
        create: jest.fn().mockResolvedValue(STORED_EVENT),
        findUnique: jest.fn().mockResolvedValue(STORED_EVENT),
        update: jest.fn().mockResolvedValue(STORED_EVENT),
        delete: jest.fn().mockResolvedValue(STORED_EVENT),
      },
      eventParticipation: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      block: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      // Creating an event now also announces it to followers and opens its
      // group chat. Without these the suite passed only because both paths
      // failed silently into their catch blocks.
      follow: { findMany: jest.fn().mockResolvedValue([]) },
      deviceToken: { findMany: jest.fn().mockResolvedValue([]) },
      conversation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 500 }),
      },
      conversationParticipant: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Overriding the provider means the real constructor — which opens a
      // connection pool — never runs.
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

  // Only the call history is reset: the resolved values configured above are
  // the default fixture, and each test overrides what it needs with `Once`.
  beforeEach(() => {
    prisma.event.create.mockClear();
    prisma.conversation.create.mockClear();
    prisma.conversationParticipant.create.mockClear();
    prisma.event.update.mockClear();
    prisma.event.delete.mockClear();
    prisma.$queryRaw.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Authentification ────────────────────────────────────────────────────

  describe('authentication', () => {
    it('rejects a request with no token (401)', async () => {
      await request(app.getHttpServer())
        .get('/events?lat=44.8378&lng=-0.5792')
        .expect(401);
    });

    it('rejects a token signed with another secret (401)', async () => {
      const forged = new JwtService({
        secret: 'a-completely-different-secret',
      }).sign({ sub: ORGANIZER, email: 'a@b.com' });

      await request(app.getHttpServer())
        .get('/events?lat=44.8378&lng=-0.5792')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('rejects an expired token (401)', async () => {
      const expired = jwt.sign(
        { sub: ORGANIZER, email: 'a@b.com' },
        { expiresIn: '-1h' },
      );

      await request(app.getHttpServer())
        .get('/events?lat=44.8378&lng=-0.5792')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });

    it('rejects a token whose sub is not a number (401)', async () => {
      const malformed = jwt.sign({ sub: 'not-an-id', email: 'a@b.com' });

      await request(app.getHttpServer())
        .get('/events?lat=44.8378&lng=-0.5792')
        .set('Authorization', `Bearer ${malformed}`)
        .expect(401);
    });
  });

  // ── Validation des entrées ──────────────────────────────────────────────

  describe('input validation', () => {
    it('rejects a search with no coordinates (400)', async () => {
      await request(app.getHttpServer())
        .get('/events')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .expect(400);
    });

    it('rejects a non-numeric id before it reaches the service (400)', async () => {
      await request(app.getHttpServer())
        .get('/events/not-a-number')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .expect(400);
    });

    it('rejects a negative radius (400)', async () => {
      await request(app.getHttpServer())
        .get('/events?lat=44.8378&lng=-0.5792&radiusKm=-5')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .expect(400);
    });

    it('rejects a malformed date bound (400)', async () => {
      await request(app.getHttpServer())
        .get('/events?lat=44.8378&lng=-0.5792&dateFrom=14/09/2026')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .expect(400);
    });

    it('accepts a valid creation body (201)', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .send(creationBody())
        .expect(201);

      // The organiser comes from the token, never from the request body.
      const arg = firstQuery(prisma.event.create) as {
        data: { organizerId: number };
      };
      expect(arg.data.organizerId).toBe(ORGANIZER);
    });

    it('accepts coordinates in the middle of the ocean (200, empty)', async () => {
      await request(app.getHttpServer())
        .get('/events?lat=0&lng=0')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .expect(200)
        .expect([]);
    });

    it('accepts an inverted date range without erroring (200, empty)', async () => {
      // Business-wise the range matches nothing; that is a legitimate empty
      // result, not a client error — the API must not answer 400 here.
      await request(app.getHttpServer())
        .get(
          '/events?lat=44.8378&lng=-0.5792&dateFrom=2026-09-30&dateTo=2026-09-01',
        )
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .expect(200)
        .expect([]);
    });

    it('rejects a malformed time on creation (400)', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .send({ ...creationBody(), time: '3pm' })
        .expect(400);
    });

    it('rejects an unknown event type (400)', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .send({ ...creationBody(), type: 'KARAOKE' })
        .expect(400);
    });

    it('rejects an undeclared property — mass assignment (400)', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .send({ ...creationBody(), organizerId: OTHER_USER })
        .expect(400);
    });

    /**
     * Regression test for the PATCH body being typed `Partial<CreateEventDto>`:
     * `Partial<T>` erases at compile time, so class-validator saw no metadata
     * and every field went through unchecked. UpdateEventDto (PartialType)
     * restores the decorators.
     */
    it('validates the PATCH body — latitude must be a number (400)', async () => {
      await request(app.getHttpServer())
        .patch('/events/10')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .send({ latitude: 'not-a-latitude' })
        .expect(400);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('validates the PATCH body — rejects an undeclared property (400)', async () => {
      await request(app.getHttpServer())
        .patch('/events/10')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .send({ organizerId: OTHER_USER })
        .expect(400);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    /**
     * The one that actually corrupted data before the fix: `time` is a
     * VarChar(10), so "3pm" was accepted by the column. The reminder sweep
     * then failed to parse it and silently skipped that event forever.
     */
    it('validates the PATCH body — time must be HH:mm (400)', async () => {
      await request(app.getHttpServer())
        .patch('/events/10')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .send({ time: '3pm' })
        .expect(400);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('accepts a partial PATCH body', async () => {
      await request(app.getHttpServer())
        .patch('/events/10')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .send({ title: 'Updated title' })
        .expect(200);

      expect(prisma.event.update).toHaveBeenCalled();
    });
  });

  // ── Autorisation ────────────────────────────────────────────────────────

  // ── Chat de groupe de l'événement ───────────────────────────────────────

  describe('event group chat', () => {
    it('opens the chat when the event is created, owned by the organiser', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .send(creationBody())
        .expect(201);

      const arg = firstQuery(prisma.conversation.create) as {
        data: Record<string, unknown>;
      };
      expect(arg.data).toMatchObject({
        type: 'GROUP',
        eventId: STORED_EVENT.id,
        ownerId: ORGANIZER,
        participants: { create: [{ userId: ORGANIZER, role: 'OWNER' }] },
      });
    });

    it('adds a joiner to the chat, read-only', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 500 });

      await request(app.getHttpServer())
        .post(`/events/${STORED_EVENT.id}/participate`)
        .set('Authorization', `Bearer ${tokenFor(OTHER_USER)}`)
        .expect(201);

      expect(prisma.conversationParticipant.create).toHaveBeenCalledWith({
        data: {
          userId: OTHER_USER,
          conversationId: 500,
          role: 'MEMBER',
        },
      });

      prisma.conversation.findUnique.mockResolvedValue(null);
    });

    it('still confirms participation when the chat cannot be reached', async () => {
      // Best-effort by design: a chat failure must not cost someone their place.
      prisma.conversation.findUnique.mockRejectedValueOnce(
        new Error('connection lost'),
      );

      await request(app.getHttpServer())
        .post(`/events/${STORED_EVENT.id}/participate`)
        .set('Authorization', `Bearer ${tokenFor(OTHER_USER)}`)
        .expect(201);

      expect(prisma.eventParticipation.create).toHaveBeenCalled();
    });
  });

  describe('authorisation', () => {
    it('refuses event creation to an unverified account (403)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ emailVerified: false });

      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${tokenFor(OTHER_USER)}`)
        .send(creationBody())
        .expect(403);
    });

    it('refuses an update by someone who is not the organiser (403)', async () => {
      await request(app.getHttpServer())
        .patch('/events/10')
        .set('Authorization', `Bearer ${tokenFor(OTHER_USER)}`)
        .send({ title: 'Hijacked' })
        .expect(403);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('refuses a deletion by someone who is not the organiser (403)', async () => {
      await request(app.getHttpServer())
        .delete('/events/10')
        .set('Authorization', `Bearer ${tokenFor(OTHER_USER)}`)
        .expect(403);

      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it('returns 404 for an event that does not exist', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get('/events/999')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .expect(404);
    });
  });

  // ── Injection SQL ───────────────────────────────────────────────────────

  describe('SQL injection', () => {
    /**
     * The search term reaches a $queryRaw. What this asserts is that it
     * arrives as a *parameter value*, never as SQL text: Prisma.sql builds a
     * prepared statement whose `strings` are the literal fragments and whose
     * `values` are the user input.
     */
    it.each([
      "'; DROP TABLE events; --",
      "' OR 1=1 --",
      "' UNION SELECT password FROM users --",
    ])('treats %p as a literal search term, not as SQL', async (payload) => {
      prisma.$queryRaw.mockClear();

      await request(app.getHttpServer())
        .get(`/events?lat=44.8378&lng=-0.5792&q=${encodeURIComponent(payload)}`)
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .expect(200);

      const sql = firstQuery(prisma.$queryRaw) as {
        strings: string[];
        values: unknown[];
      };

      // The payload is carried in `values`, wrapped as a LIKE pattern…
      expect(sql.values).toContain(`%${payload}%`);
      // …and no fragment of the statement itself contains it.
      expect(sql.strings.join('')).not.toContain('DROP TABLE');
      expect(sql.strings.join('')).not.toContain('UNION SELECT');
    });

    it('escapes LIKE wildcards so they match literally', async () => {
      prisma.$queryRaw.mockClear();

      await request(app.getHttpServer())
        .get('/events?lat=44.8378&lng=-0.5792&q=100%25')
        .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`)
        .expect(200);

      const sql = firstQuery(prisma.$queryRaw) as { values: unknown[] };
      expect(sql.values).toContain('%100\\%%');
    });
  });
});

/**
 * The statement handed to $queryRaw on the first call. Typed through
 * `unknown[]` because a jest mock records its arguments as `any`.
 */
function firstQuery(mock: jest.Mock): unknown {
  const args = mock.mock.calls[0] as unknown[];
  return args[0];
}

/** A valid creation body, so each test only varies the field it is about. */
function creationBody() {
  return {
    title: 'Random play dance',
    type: 'RANDOM_PLAY_DANCE',
    latitude: 44.8378,
    longitude: -0.5792,
    address: 'Place de la Bourse, Bordeaux',
    date: '2026-09-14',
    time: '15:00',
    description: 'Bring your best moves.',
  };
}
