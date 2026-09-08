import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bringing a deleted account back.
 *
 * Deleting destroys nothing until the grace period runs out, so reactivating is
 * the four parked columns moving home. What these cover is who is allowed to
 * ask, and what happens when the address they are asking for is no longer
 * theirs to take.
 */

const USER_ID = 12;
const PASSWORD = 'correct horse battery';
const EMAIL = 'mina@example.com';
const CODE = '424242';

describe('AuthService — reactivation', () => {
  let service: AuthService;
  let mail: { sendReactivationCode: jest.Mock };
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    emailVerificationToken: {
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  /** A deleted account as Prisma hands it back, still inside the window. */
  const deleted = (over: Record<string, unknown> = {}) => ({
    id: USER_ID,
    email: `deleted+${USER_ID}@k-byeol.invalid`,
    username: `Deleted user #${USER_ID}`,
    password: bcrypt.hashSync(PASSWORD, 4),
    provider: 'email',
    avatar: null,
    bio: null,
    deletedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    restoreEmail: EMAIL,
    restoreUsername: 'mina',
    restoreAvatar: 'https://example.test/mina.png',
    restoreBio: 'stan of everything',
    ...over,
  });

  beforeEach(() => {
    prisma = {
      user: {
        // No live account holds this address.
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(deleted()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(deleted()),
        update: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: USER_ID,
            provider: 'email',
            ...args.data,
          }),
        ),
      },
      emailVerificationToken: {
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mail = { sendReactivationCode: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(
      prisma as unknown as PrismaService,
      new JwtService({ secret: 'a-test-secret-long-enough-to-sign-with' }),
      mail as unknown as MailService,
    );
  });

  // ── Meeting it at the sign-in screen ─────────────────────────────────────

  it('offers reactivation instead of reporting bad credentials', async () => {
    await expect(
      service.login({ email: EMAIL, password: PASSWORD }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('says nothing to somebody who does not know the password', async () => {
    // Otherwise typing an address would reveal whether it ever belonged to
    // anyone — the enumeration the login route is careful to avoid.
    await expect(
      service.login({ email: EMAIL, password: 'not it' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('has nothing to offer once the grace period has run out', async () => {
    // The purge clears restore_email, so the account stops answering to the
    // address it used to hold and the lookup simply misses.
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.login({ email: EMAIL, password: PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // ── Asking for it back ───────────────────────────────────────────────────

  it('emails a code to the address the account used to hold', async () => {
    const result = await service.requestReactivation({
      email: EMAIL,
      password: PASSWORD,
    });

    expect(mail.sendReactivationCode).toHaveBeenCalledWith(
      EMAIL,
      expect.any(String),
      expect.any(Number),
    );
    expect(result).toEqual(expect.objectContaining({ codeSent: true }));
  });

  it('refuses the wrong password', async () => {
    await expect(
      service.requestReactivation({ email: EMAIL, password: 'not it' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mail.sendReactivationCode).not.toHaveBeenCalled();
  });

  it('refuses when somebody else has taken the address since', async () => {
    // The email is freed the moment an account is deleted, so during the
    // window two people can have a claim on it. First come, first served.
    prisma.user.findUnique.mockResolvedValue({ id: 99 });

    await expect(
      service.requestReactivation({ email: EMAIL, password: PASSWORD }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('brings a social account back through its provider, with no code', async () => {
    prisma.user.findFirst.mockResolvedValue(deleted({ provider: 'google' }));
    prisma.user.findUniqueOrThrow.mockResolvedValue(
      deleted({ provider: 'google' }),
    );
    const identity = jest
      .spyOn(service, 'assertSocialIdentity')
      .mockResolvedValue(undefined);

    const result = await service.requestReactivation({
      email: EMAIL,
      accessToken: 'supabase-token',
    });

    expect(identity).toHaveBeenCalledWith('supabase-token', EMAIL);
    expect(mail.sendReactivationCode).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ reactivated: true }) as object,
    );
  });

  // ── Confirming ───────────────────────────────────────────────────────────

  it('puts the parked identity back and clears the deletion', async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 1,
      userId: USER_ID,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.confirmReactivation({
      email: EMAIL,
      code: CODE,
    });

    const calls = prisma.user.update.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    const { data } = calls[0][0];
    expect(data).toEqual(
      expect.objectContaining({
        email: EMAIL,
        username: 'mina',
        avatar: 'https://example.test/mina.png',
        bio: 'stan of everything',
        deletedAt: null,
        restoreEmail: null,
        restoreUsername: null,
        restoreAvatar: null,
        restoreBio: null,
        // Coming back through the mailbox is the proof signing up asks for.
        emailVerified: true,
      }) as Record<string, unknown>,
    );
    expect(result.access_token).toEqual(expect.any(String));
  });

  it('rejects a code that belongs to somebody else', async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 999,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.confirmReactivation({ email: EMAIL, code: CODE }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 1,
      userId: USER_ID,
      usedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(
      service.confirmReactivation({ email: EMAIL, code: CODE }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('burns the code so it cannot be replayed', async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 7,
      userId: USER_ID,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.confirmReactivation({ email: EMAIL, code: CODE });

    expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { usedAt: expect.any(Date) as Date },
    });
  });

  it('takes the nearest free username when the old one is gone', async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 1,
      userId: USER_ID,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    // The address is free — checked by email — but "mina" is not.
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { email?: string; username?: string } }) =>
        Promise.resolve(where.username === 'mina' ? { id: 99 } : null),
    );

    await service.confirmReactivation({ email: EMAIL, code: CODE });

    const calls = prisma.user.update.mock.calls as [
      { data: { username: string } },
    ][];
    // A taken name is no reason to refuse the whole reactivation.
    expect(calls[0][0].data.username).toBe('mina1');
  });
});
