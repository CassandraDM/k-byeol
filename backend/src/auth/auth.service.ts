import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { ConfirmReactivationDto, ReactivateDto } from './dto/reactivate.dto';
import { GRACE_PERIOD_DAYS, reactivationCutoff } from '../account/grace-period';

/** How long a password-reset code stays valid, in minutes. */
const RESET_TOKEN_TTL_MINUTES = 5;

/** How long a reactivation code stays valid, in minutes. */
const REACTIVATION_TTL_MINUTES = 5;

/** How long an email-verification code stays valid, in minutes. */
const EMAIL_VERIFICATION_TTL_MINUTES = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException('Email already in use');
    }

    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password: hashedPassword,
      },
    });

    // Send the email-verification code (best-effort — never block signup).
    await this.sendEmailVerificationCode(user.id, user.email).catch((e) => {
      console.error('[register] Failed to send verification email →', e);
    });

    return {
      access_token: this.generateToken(user.id, user.email),
      emailVerified: user.emailVerified,
      username: user.username,
      email: user.email,
      provider: user.provider,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // A deleted account no longer holds the address it signed up with, so this
    // lookup misses it — which is exactly where somebody coming back lands.
    if (!user || user.deletedAt) {
      await this.offerReactivation(dto.email, dto.password);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      access_token: this.generateToken(user.id, user.email),
      emailVerified: user.emailVerified,
      username: user.username,
      email: user.email,
      // The client needs to know how this account authenticates: it decides
      // what proof to ask for before something irreversible, and a social
      // account has no password its owner could ever be asked to re-type.
      provider: user.provider,
    };
  }

  /**
   * Signs in (or signs up) a user via a social provider (Google / Apple).
   *
   * The client performs the OAuth flow through Supabase and sends us the
   * resulting Supabase access token. We validate it against Supabase, then
   * find-or-create the matching app user and issue our own JWT.
   */
  async socialLogin(dto: SocialLoginDto) {
    const supabaseUser = await this.fetchSupabaseUser(dto.accessToken);
    const email = supabaseUser.email?.toLowerCase();
    if (!email) {
      throw new BadRequestException(
        'Your social account did not share an email address.',
      );
    }

    // A deleted account released this address when it went, so `existing` is
    // null for one. Before treating that as a new signup, check whether it is
    // their own account they are coming back to — creating a fresh one over
    // the top would quietly throw away everything reactivation could return.
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await this.offerReactivation(email);
    }

    if (existing) {
      // Same email but a different sign-in method → clear error (no linking).
      if (existing.provider !== dto.provider) {
        throw new ConflictException(
          'An account with this email already exists. Please sign in with your email and password.',
        );
      }
      return {
        access_token: this.generateToken(existing.id, existing.email),
        emailVerified: existing.emailVerified,
        username: existing.username,
        email: existing.email,
        provider: existing.provider,
        isNewUser: false,
      };
    }

    // First social login → create the profile automatically.
    const username = await this.generateUniqueUsername(supabaseUser);
    const randomPassword = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      10,
    );
    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        password: randomPassword, // unused for social accounts, but column is required
        provider: dto.provider,
        emailVerified: true, // Google/Apple already verified the email
      },
    });

    return {
      access_token: this.generateToken(user.id, user.email),
      emailVerified: true,
      username: user.username,
      email: user.email,
      provider: user.provider,
      isNewUser: true,
    };
  }

  // ── Reactivation ─────────────────────────────────────────────────────────

  /**
   * The deleted account that still answers to `email`, if the window is open.
   *
   * Deleting frees the address and parks it in `restore_email`, so this is the
   * only place it can still be found. Past the grace period the purge sweep has
   * cleared that column, which is what makes the search come up empty rather
   * than needing a second condition.
   */
  private async findReactivatable(email: string) {
    return this.prisma.user.findFirst({
      where: {
        restoreEmail: email,
        deletedAt: { not: null, gte: reactivationCutoff() },
      },
    });
  }

  /**
   * Interrupts a sign-in that has landed on a deleted account, so the client
   * can offer to bring it back instead of reporting bad credentials.
   *
   * For a password account the password is checked first: without it this would
   * tell anyone who typed an address whether it once belonged to somebody. A
   * social account has no password to check, and its provider has already
   * vouched for the address by the time we get here.
   */
  private async offerReactivation(email: string, password?: string) {
    const account = await this.findReactivatable(email);
    if (!account) return;

    if (account.provider === 'email') {
      if (!password) return;
      const valid = await bcrypt.compare(password, account.password);
      if (!valid) return;
    }

    throw new ConflictException({
      message:
        'This account was deleted. You can bring it back, or sign up again ' +
        'with the same email.',
      reactivation: {
        available: true,
        // Echoed back because a social sign-in never told the client which
        // address it was using — the provider did, to us. Nothing is disclosed
        // either way: whoever gets this far has just proved the address is
        // theirs, by password or by provider.
        email,
        provider: account.provider,
        deletedAt: account.deletedAt,
        gracePeriodDays: GRACE_PERIOD_DAYS,
      },
    });
  }

  /**
   * Starts bringing a deleted account back.
   *
   * A password account is sent a code at the address it used to hold — the one
   * thing somebody who guessed the password still cannot reach. A social
   * account is already through: its provider has just vouched for the address,
   * which is the same proof, so it comes back here and now.
   */
  async requestReactivation(dto: ReactivateDto) {
    const account = await this.findReactivatable(dto.email);
    if (!account) {
      throw new BadRequestException(
        'There is no deleted account to bring back for this email.',
      );
    }

    await this.assertAddressStillFree(account.id, dto.email);

    if (account.provider !== 'email') {
      if (!dto.accessToken) {
        throw new BadRequestException(
          `Sign in with ${account.provider} to bring your account back.`,
        );
      }
      await this.assertSocialIdentity(dto.accessToken, dto.email);
      return this.reactivate(account.id);
    }

    if (!dto.password) {
      throw new BadRequestException('Your password is needed to confirm.');
    }
    const valid = await bcrypt.compare(dto.password, account.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.sendReactivationCode(account.id, dto.email);
    return { codeSent: true, email: dto.email };
  }

  /** Finishes an email account's reactivation with the code it was sent. */
  async confirmReactivation(dto: ConfirmReactivationDto) {
    const account = await this.findReactivatable(dto.email);
    if (!account) {
      throw new BadRequestException(
        'There is no deleted account to bring back for this email.',
      );
    }

    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: this.hashToken(dto.code) },
    });
    if (!record || record.userId !== account.id || record.usedAt) {
      throw new BadRequestException('Invalid reactivation code');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This reactivation code has expired');
    }

    await this.assertAddressStillFree(account.id, dto.email);
    await this.prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return this.reactivate(account.id);
  }

  /**
   * Puts the account back.
   *
   * Nothing was destroyed when it was deleted, so this is only the four parked
   * columns moving home and `deletedAt` being cleared. Everything the account
   * owned — its events, its participations, who it followed — becomes visible
   * again in the same motion, because none of it ever went anywhere.
   */
  private async reactivate(userId: number) {
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: account.restoreEmail!,
        username: await this.freeUsername(userId, account.restoreUsername!),
        avatar: account.restoreAvatar,
        bio: account.restoreBio,
        deletedAt: null,
        restoreEmail: null,
        restoreUsername: null,
        restoreAvatar: null,
        restoreBio: null,
        // Coming back through the mailbox, or through the provider that owns
        // it, is the same proof signing up asks for.
        emailVerified: true,
      },
    });

    return {
      access_token: this.generateToken(user.id, user.email),
      emailVerified: true,
      username: user.username,
      email: user.email,
      provider: user.provider,
      reactivated: true,
    };
  }

  /**
   * Refuses a reactivation whose address has been taken in the meantime.
   *
   * The email is freed the moment an account is deleted — that is what lets
   * somebody sign up again with it straight away — so during the grace period
   * two people can have a claim on it, and whoever got there first keeps it.
   */
  private async assertAddressStillFree(userId: number, email: string) {
    const holder = await this.prisma.user.findUnique({ where: { email } });
    if (holder && holder.id !== userId) {
      throw new ConflictException(
        'That email now belongs to another account, so this one cannot be ' +
          'brought back.',
      );
    }
  }

  /**
   * The old username back, or the nearest free one.
   *
   * Unlike the email, a taken username is no reason to refuse the whole
   * reactivation — the account can come back under a suffixed name and be
   * renamed later.
   */
  private async freeUsername(userId: number, wanted: string): Promise<string> {
    let candidate = wanted;
    for (let suffix = 1; suffix < 100; suffix++) {
      const holder = await this.prisma.user.findUnique({
        where: { username: candidate },
      });
      if (!holder || holder.id === userId) return candidate;
      candidate = `${wanted}${suffix}`.slice(0, 50);
    }
    return `${wanted}${randomBytes(3).toString('hex')}`.slice(0, 50);
  }

  /** Mints, stores and emails a one-time code for bringing an account back. */
  private async sendReactivationCode(userId: number, email: string) {
    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId, usedAt: null },
    });

    let rawCode = '';
    let tokenHash = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      rawCode = this.generateSixDigitCode();
      tokenHash = this.hashToken(rawCode);
      const clash = await this.prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
      });
      if (!clash) break;
    }

    const expiresAt = new Date(
      Date.now() + REACTIVATION_TTL_MINUTES * 60 * 1000,
    );
    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    await this.mail.sendReactivationCode(
      email,
      rawCode,
      REACTIVATION_TTL_MINUTES,
    );
  }

  /**
   * Confirms that `accessToken` is a live session with the social provider, and
   * that it belongs to `email`.
   *
   * This is how a Google or Apple account proves who it is when something
   * irreversible is asked of it. Those accounts hold a random password minted
   * at signup that the user has never seen, so re-typing a password is not a
   * confirmation they are able to give — going back through the provider is.
   */
  async assertSocialIdentity(accessToken: string, email: string) {
    const supabaseUser = await this.fetchSupabaseUser(accessToken);
    if (supabaseUser.email?.toLowerCase() !== email.toLowerCase()) {
      throw new UnauthorizedException(
        'That sign-in belongs to a different account.',
      );
    }
  }

  /**
   * Verifies the current user's email using the 6-digit code they were sent.
   */
  async verifyEmail(userId: number, dto: VerifyEmailDto) {
    const tokenHash = this.hashToken(dto.code);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.userId !== userId || record.usedAt) {
      throw new BadRequestException('Invalid verification code');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This verification code has expired');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { emailVerified: true };
  }

  /**
   * Re-sends a fresh email-verification code to the current user.
   * If the email is already verified, reports that instead of sending.
   */
  async resendVerification(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.emailVerified) {
      return {
        alreadyVerified: true,
        message: 'Your email is already verified.',
      };
    }
    await this.sendEmailVerificationCode(user.id, user.email);
    return {
      alreadyVerified: false,
      message: 'A new verification code has been sent.',
    };
  }

  /**
   * Generates, stores and emails a fresh 6-digit verification code for a user.
   */
  private async sendEmailVerificationCode(userId: number, email: string) {
    // Invalidate any previous pending codes for this user.
    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId, usedAt: null },
    });

    let rawCode = '';
    let tokenHash = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      rawCode = this.generateSixDigitCode();
      tokenHash = this.hashToken(rawCode);
      const clash = await this.prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
      });
      if (!clash) break;
    }

    const expiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000,
    );
    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    await this.mail.sendEmailVerification(
      email,
      rawCode,
      EMAIL_VERIFICATION_TTL_MINUTES,
    );
  }

  /**
   * Starts the password-reset flow.
   *
   * Always resolves with a generic success message regardless of whether the
   * email belongs to an account — this prevents attackers from using the
   * endpoint to discover which emails are registered (account enumeration).
   * When the account exists, a short-lived single-use token is emailed.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const genericResponse = {
      message:
        'If an account exists for this email, a reset link has been sent.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      return genericResponse;
    }

    // Invalidate any previous, still-pending tokens for this user.
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    // Generate a 6-digit code. Retry on the (very rare) chance the hash of a
    // freshly generated code already exists for another pending reset.
    let rawToken = '';
    let tokenHash = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      rawToken = this.generateSixDigitCode();
      tokenHash = this.hashToken(rawToken);
      const clash = await this.prisma.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      if (!clash) break;
    }

    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    await this.mail.sendPasswordReset(
      user.email,
      rawToken,
      RESET_TOKEN_TTL_MINUTES,
    );

    return genericResponse;
  }

  /**
   * Checks that a reset code is valid (exists, not used, not expired) WITHOUT
   * consuming it. Used to gate the "enter new password" step in the app.
   */
  async verifyResetCode(dto: VerifyResetCodeDto) {
    await this.findValidToken(dto.token);
    return { valid: true };
  }

  /**
   * Consumes a reset code and updates the user's password.
   * Throws on an invalid, already-used or expired code.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.findValidToken(dto.token);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Update the password and mark the token used atomically.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Your password has been reset. You can now log in.' };
  }

  /**
   * Looks up a reset code and asserts it is usable (exists, not used, not
   * expired). Returns the record, or throws a BadRequestException.
   */
  private async findValidToken(token: string) {
    const tokenHash = this.hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt) {
      throw new BadRequestException('Invalid or already-used reset code');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This reset code has expired');
    }
    return record;
  }

  /** SHA-256 hash of a reset code — only the hash is ever stored. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Cryptographically random 6-digit code, zero-padded (e.g. "042317"). */
  private generateSixDigitCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /**
   * Validates a Supabase access token by asking Supabase who it belongs to.
   * Returns the Supabase user (email, metadata…) or throws if the token is bad.
   */
  private async fetchSupabaseUser(
    accessToken: string,
  ): Promise<{ email?: string; user_metadata?: Record<string, any> }> {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are not configured.');
    }

    const res = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      throw new UnauthorizedException('Invalid social login session.');
    }
    return res.json() as Promise<{
      email?: string;
      user_metadata?: Record<string, any>;
    }>;
  }

  /** Builds a unique username from the social profile (name or email). */
  private async generateUniqueUsername(supabaseUser: {
    email?: string;
    user_metadata?: Record<string, any>;
  }): Promise<string> {
    const raw =
      (supabaseUser.user_metadata?.name as string) ||
      (supabaseUser.user_metadata?.full_name as string) ||
      supabaseUser.email?.split('@')[0] ||
      'user';
    let base = raw.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
    if (base.length < 2) base = 'user';

    let candidate = base;
    let suffix = 0;
    while (
      await this.prisma.user.findUnique({ where: { username: candidate } })
    ) {
      suffix += 1;
      candidate = `${base}${suffix}`.slice(0, 50);
    }
    return candidate;
  }

  private generateToken(userId: number, email: string): string {
    return this.jwt.sign({ sub: userId, email });
  }
}
