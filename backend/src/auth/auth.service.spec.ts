import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

describe('AuthService — password reset', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
    passwordResetToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    emailVerificationToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mail: { sendPasswordReset: jest.Mock; sendEmailVerification: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      emailVerificationToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    mail = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('forgotPassword', () => {
    it('returns a generic message and sends no email when the user is unknown', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await service.forgotPassword({ email: 'nobody@x.com' });

      expect(res.message).toMatch(/if an account exists/i);
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('creates a hashed single-use token and emails the raw token when the user exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 7, email: 'a@b.com' });
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});

      const res = await service.forgotPassword({ email: 'a@b.com' });

      // Previous pending tokens are invalidated first
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 7, usedAt: null },
      });

      // A token is stored — but only its hash, never the raw value
      const stored = prisma.passwordResetToken.create.mock.calls[0][0].data;
      expect(stored.userId).toBe(7);
      expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
      expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // The email gets the RAW code (6 digits), and its hash matches what we stored
      const rawToken: string = mail.sendPasswordReset.mock.calls[0][1];
      expect(rawToken).toMatch(/^\d{6}$/);
      const expectedHash = createHash('sha256')
        .update(rawToken)
        .digest('hex');
      expect(expectedHash).toBe(stored.tokenHash);
      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        rawToken,
        expect.any(Number),
      );

      expect(res.message).toMatch(/if an account exists/i);
    });
  });

  describe('socialLogin', () => {
    const mockSupabaseUser = (user: object) => {
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(user),
      });
    };

    beforeEach(() => {
      process.env.SUPABASE_URL = 'https://ref.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'anon-key';
    });
    afterEach(() => {
      (global as any).fetch = undefined;
    });

    it('creates a verified profile on first Google login', async () => {
      mockSupabaseUser({
        email: 'new@gmail.com',
        user_metadata: { name: 'New Person' },
      });
      prisma.user.findUnique.mockResolvedValue(null); // no existing user / username free
      prisma.user.create.mockResolvedValue({
        id: 10,
        username: 'NewPerson',
        email: 'new@gmail.com',
      });

      const res = await service.socialLogin({
        provider: 'google',
        accessToken: 'tok',
      });

      expect(res.isNewUser).toBe(true);
      expect(res.emailVerified).toBe(true);
      const created = prisma.user.create.mock.calls[0][0].data;
      expect(created.provider).toBe('google');
      expect(created.emailVerified).toBe(true);
      expect(created.email).toBe('new@gmail.com');
    });

    it('logs in a returning social user without recreating them', async () => {
      mockSupabaseUser({ email: 'me@gmail.com' });
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        username: 'Me',
        email: 'me@gmail.com',
        provider: 'google',
        emailVerified: true,
      });

      const res = await service.socialLogin({
        provider: 'google',
        accessToken: 'tok',
      });

      expect(res.isNewUser).toBe(false);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects when the email already belongs to a password account', async () => {
      mockSupabaseUser({ email: 'taken@gmail.com' });
      prisma.user.findUnique.mockResolvedValue({
        id: 4,
        username: 'Taken',
        email: 'taken@gmail.com',
        provider: 'email', // password account
        emailVerified: true,
      });

      await expect(
        service.socialLogin({ provider: 'google', accessToken: 'tok' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('marks the email verified for a valid code belonging to the user', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 5,
        userId: 7,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const res = await service.verifyEmail(7, { code: '123456' });

      expect(res).toEqual({ emailVerified: true });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const userUpdate = prisma.user.update.mock.calls[0][0];
      expect(userUpdate.where).toEqual({ id: 7 });
      expect(userUpdate.data.emailVerified).toBe(true);
    });

    it('rejects a code that belongs to a different user', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 5,
        userId: 99, // different user
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.verifyEmail(7, { code: '123456' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an expired code', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 5,
        userId: 7,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.verifyEmail(7, { code: '123456' }),
      ).rejects.toThrow(/expired/i);
    });
  });

  describe('resendVerification', () => {
    it('reports alreadyVerified and sends nothing when the email is verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 7,
        email: 'a@b.com',
        emailVerified: true,
      });

      const res = await service.resendVerification(7);

      expect(res.alreadyVerified).toBe(true);
      expect(mail.sendEmailVerification).not.toHaveBeenCalled();
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });

    it('sends a fresh code when the email is not verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 7,
        email: 'a@b.com',
        emailVerified: false,
      });
      prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.emailVerificationToken.create.mockResolvedValue({});

      const res = await service.resendVerification(7);

      expect(res.alreadyVerified).toBe(false);
      expect(mail.sendEmailVerification).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyResetCode', () => {
    it('accepts a valid code without consuming it', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const res = await service.verifyResetCode({ token: '123456' });

      expect(res).toEqual({ valid: true });
      // Must NOT mark the code used or change the password
      expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired code', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.verifyResetCode({ token: '000000' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'bogus', password: 'newpass123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.resetPassword({ token: 'used', password: 'newpass123' }),
      ).rejects.toThrow(/invalid or already-used/i);
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword({ token: 'old', password: 'newpass123' }),
      ).rejects.toThrow(/expired/i);
    });

    it('hashes the new password and marks the token used on success', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 42,
        userId: 7,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const res = await service.resetPassword({
        token: 'valid',
        password: 'newpass123',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // The user update stores a bcrypt hash, never the plaintext
      const userUpdateArg = prisma.user.update.mock.calls[0][0];
      expect(userUpdateArg.where).toEqual({ id: 7 });
      expect(userUpdateArg.data.password).not.toBe('newpass123');
      expect(await bcrypt.compare('newpass123', userUpdateArg.data.password)).toBe(
        true,
      );

      // The token is marked used
      const tokenUpdateArg = prisma.passwordResetToken.update.mock.calls[0][0];
      expect(tokenUpdateArg.where).toEqual({ id: 42 });
      expect(tokenUpdateArg.data.usedAt).toBeInstanceOf(Date);

      expect(res.message).toMatch(/has been reset/i);
    });
  });
});
