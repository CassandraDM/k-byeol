import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AccountService, reservedEmailFor } from './account.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * What deletion is allowed to do, and — just as much — what it must leave
 * alone. The database is a double: the question here is which rows the service
 * decides to touch, not what Postgres does with them afterwards.
 */

const USER_ID = 7;
const PASSWORD = 'correct horse battery';

describe('AccountService', () => {
  let service: AccountService;
  let auth: { assertSocialIdentity: jest.Mock };
  let prisma: {
    $transaction: jest.Mock;
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    event: { deleteMany: jest.Mock; findMany: jest.Mock };
    eventParticipation: { deleteMany: jest.Mock; findMany: jest.Mock };
    conversationParticipant: { deleteMany: jest.Mock; findMany: jest.Mock };
    follow: { deleteMany: jest.Mock; findMany: jest.Mock };
    block: { deleteMany: jest.Mock; findMany: jest.Mock };
    userPreferences: { deleteMany: jest.Mock };
    deviceToken: { deleteMany: jest.Mock; findMany: jest.Mock };
    passwordResetToken: { deleteMany: jest.Mock };
    emailVerificationToken: { deleteMany: jest.Mock };
    groupRequest: { deleteMany: jest.Mock; findMany: jest.Mock };
    message: { findMany: jest.Mock; deleteMany: jest.Mock };
    report: { findMany: jest.Mock; deleteMany: jest.Mock };
  };

  /** A live account as Prisma hands it back. */
  const account = (over: Partial<Record<string, unknown>> = {}) => ({
    id: USER_ID,
    email: 'mina@example.com',
    username: 'mina',
    password: bcrypt.hashSync(PASSWORD, 4),
    provider: 'email',
    deletedAt: null,
    ...over,
  });

  beforeEach(() => {
    const deleteMany = () => jest.fn().mockResolvedValue({ count: 0 });
    const findMany = () => jest.fn().mockResolvedValue([]);

    prisma = {
      $transaction: jest.fn().mockResolvedValue([]),
      user: {
        findUnique: jest.fn().mockResolvedValue(account()),
        // Nothing is squatting the reserved identity by default.
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      event: { deleteMany: deleteMany(), findMany: findMany() },
      eventParticipation: { deleteMany: deleteMany(), findMany: findMany() },
      conversationParticipant: {
        deleteMany: deleteMany(),
        findMany: findMany(),
      },
      follow: { deleteMany: deleteMany(), findMany: findMany() },
      block: { deleteMany: deleteMany(), findMany: findMany() },
      userPreferences: { deleteMany: deleteMany() },
      deviceToken: { deleteMany: deleteMany(), findMany: findMany() },
      passwordResetToken: { deleteMany: deleteMany() },
      emailVerificationToken: { deleteMany: deleteMany() },
      groupRequest: { deleteMany: deleteMany(), findMany: findMany() },
      message: { findMany: findMany(), deleteMany: deleteMany() },
      report: { findMany: findMany(), deleteMany: deleteMany() },
    };

    auth = { assertSocialIdentity: jest.fn().mockResolvedValue(undefined) };

    service = new AccountService(
      prisma as unknown as PrismaService,
      auth as unknown as AuthService,
    );
  });

  // ── Confirming it is really them ─────────────────────────────────────────

  it('refuses to delete an email account without its password', async () => {
    await expect(service.deleteAccount(USER_ID, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to delete on the wrong password', async () => {
    await expect(
      service.deleteAccount(USER_ID, { password: 'not it' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('asks a social account for its provider instead of a password', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ provider: 'google' }));

    // A password is not a proof this account can give — it holds a random one
    // minted at signup that its owner has never seen.
    await expect(
      service.deleteAccount(USER_ID, { password: PASSWORD }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.deleteAccount(USER_ID, { accessToken: 'supabase-token' });
    expect(auth.assertSocialIdentity).toHaveBeenCalledWith(
      'supabase-token',
      'mina@example.com',
    );
  });

  it('reports an already-deleted account as gone', async () => {
    prisma.user.findUnique.mockResolvedValue(
      account({ deletedAt: new Date() }),
    );

    await expect(
      service.deleteAccount(USER_ID, { password: PASSWORD }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── What deletion does ───────────────────────────────────────────────────

  it('frees the email and username, keeping them only for a restore', async () => {
    await service.deleteAccount(USER_ID, { password: PASSWORD });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          email: reservedEmailFor(USER_ID),
          restoreEmail: 'mina@example.com',
          restoreUsername: 'mina',
          avatar: null,
          bio: null,
          deletedAt: expect.any(Date) as Date,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('sidesteps a reserved identity somebody else is already wearing', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 99 });

    await service.deleteAccount(USER_ID, { password: PASSWORD });

    const calls = prisma.user.update.mock.calls as [
      { data: { email: string; username: string } },
    ][];
    const { email } = calls[0][0].data;
    expect(email).not.toBe(reservedEmailFor(USER_ID));
    expect(email).toContain(`deleted+${USER_ID}.`);
  });

  it('destroys nothing at all', async () => {
    await service.deleteAccount(USER_ID, { password: PASSWORD });

    // The whole point: everything the account owns stays exactly where it is,
    // so reactivating inside the grace period gives it back as it was rather
    // than as a shell. Destroying is the purge sweep's job, thirty days later.
    for (const model of [
      prisma.event,
      prisma.eventParticipation,
      prisma.conversationParticipant,
      prisma.follow,
      prisma.block,
      prisma.userPreferences,
      prisma.deviceToken,
      prisma.emailVerificationToken,
      prisma.groupRequest,
      prisma.message,
      prisma.report,
    ]) {
      expect(model.deleteMany).not.toHaveBeenCalled();
    }
  });

  it('revokes pending reset codes, which are the one way back in', async () => {
    await service.deleteAccount(USER_ID, { password: PASSWORD });

    // A code minted before the deletion would let somebody set a password on a
    // deleted account and walk straight past reactivation.
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, usedAt: null },
    });
  });

  // ── Export ───────────────────────────────────────────────────────────────

  it('exports the account, listings key included', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...account(),
      avatar: null,
      bio: null,
      role: 'user',
      emailVerified: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-02-01'),
      preferences: null,
    });

    const data = await service.exportData(USER_ID);

    expect(data.profile.email).toBe('mina@example.com');
    // Present but empty: the marketplace has no model yet, and the shape
    // should not change under a reader the day it ships.
    expect(data.listings).toEqual([]);
    expect(data.exportedAt).toEqual(expect.any(String));
  });

  it('has nothing to export for a deleted account', async () => {
    prisma.user.findUnique.mockResolvedValue(
      account({ deletedAt: new Date(), preferences: null }),
    );

    await expect(service.exportData(USER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
