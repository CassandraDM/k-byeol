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

/** How long a password-reset code stays valid, in minutes. */
const RESET_TOKEN_TTL_MINUTES = 5;

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
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
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

    const existing = await this.prisma.user.findUnique({ where: { email } });

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
      isNewUser: true,
    };
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
