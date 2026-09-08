import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import helmet from 'helmet';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * End-to-end coverage of the account's own two routes, through the real HTTP
 * stack. PrismaService is a double as everywhere else in this suite: what is
 * under test is the boundary — who may ask, with what proof, and what comes
 * back — not the SQL that follows.
 */

const ME = 1;
const PASSWORD = 'correct horse battery';

/** The parts of the export these tests look at. */
type ExportBody = {
  exportedAt: string;
  profile: { email: string };
  listings: unknown[];
};

/** The account row every user lookup resolves to. Reset before each test. */
let account: Record<string, unknown>;

describe('Account (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let prisma: {
    $transaction: jest.Mock;
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    [model: string]: unknown;
  };

  const tokenFor = (id: number) =>
    jwt.sign({ sub: id, email: `user${id}@example.com` });

  const auth = (id: number) => ({ Authorization: `Bearer ${tokenFor(id)}` });

  beforeAll(async () => {
    const collection = () => ({
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    });

    prisma = {
      $transaction: jest.fn().mockResolvedValue([]),
      user: {
        findUnique: jest.fn(() => Promise.resolve(account)),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      event: collection(),
      eventParticipation: collection(),
      conversationParticipant: collection(),
      conversation: collection(),
      follow: collection(),
      block: collection(),
      userPreferences: collection(),
      deviceToken: collection(),
      passwordResetToken: collection(),
      emailVerificationToken: collection(),
      groupRequest: collection(),
      message: collection(),
      report: collection(),
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
    account = {
      id: ME,
      email: 'mina@example.com',
      username: 'mina',
      password: bcrypt.hashSync(PASSWORD, 4),
      avatar: null,
      bio: null,
      role: 'user',
      provider: 'email',
      emailVerified: true,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      preferences: null,
    };
    prisma.$transaction.mockClear();
    prisma.user.update.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Authentication ───────────────────────────────────────────────────────

  it('refuses both routes without a token', async () => {
    await request(app.getHttpServer())
      .delete('/me')
      .send({ password: PASSWORD })
      .expect(401);
    await request(app.getHttpServer()).get('/me/export').expect(401);
  });

  it('refuses a token belonging to an account already deleted', async () => {
    account.deletedAt = new Date();

    // Tokens live seven days and there is no revocation list, so this is the
    // only thing standing between a deleted account and a week of further use.
    await request(app.getHttpServer())
      .get('/me/export')
      .set(auth(ME))
      .expect(401);
  });

  // ── DELETE /me ───────────────────────────────────────────────────────────

  it('will not delete an email account without its password', async () => {
    await request(app.getHttpServer()).delete('/me').set(auth(ME)).expect(400);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('will not delete on the wrong password', async () => {
    await request(app.getHttpServer())
      .delete('/me')
      .set(auth(ME))
      .send({ password: 'not it' })
      .expect(401);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes on the right password and says the email is free again', async () => {
    const res = await request(app.getHttpServer())
      .delete('/me')
      .set(auth(ME))
      .send({ password: PASSWORD })
      .expect(200);

    // One UPDATE and nothing else: deleting hides, it does not destroy.
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual(
      expect.objectContaining({
        gracePeriodDays: expect.any(Number) as number,
      }),
    );
  });

  it('rejects a body carrying anything the DTO does not declare', async () => {
    // whitelist + forbidNonWhitelisted: a mass-assignment attempt should fail
    // loudly rather than be quietly stripped.
    await request(app.getHttpServer())
      .delete('/me')
      .set(auth(ME))
      .send({ password: PASSWORD, userId: 2 })
      .expect(400);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('has no id in its path to point at somebody else', async () => {
    // /me is the whole address. There is no /me/2 to try.
    await request(app.getHttpServer())
      .delete('/me/2')
      .set(auth(ME))
      .send({ password: PASSWORD })
      .expect(404);
  });

  // ── GET /me/export ───────────────────────────────────────────────────────

  it('serves the export as a downloadable attachment', async () => {
    const res = await request(app.getHttpServer())
      .get('/me/export')
      .set(auth(ME))
      .expect(200);

    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="k-byeol-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const body = res.body as ExportBody;
    expect(body.profile).toEqual(
      expect.objectContaining({ email: 'mina@example.com' }),
    );
    expect(body.listings).toEqual([]);
  });

  it('exports the caller, whoever the caller is', async () => {
    // The route reads the id from the token, so there is no parameter to bend.
    const res = await request(app.getHttpServer())
      .get('/me/export')
      .set(auth(99))
      .expect(200);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99 } }),
    );
    expect((res.body as ExportBody).exportedAt).toEqual(expect.any(String));
  });
});
