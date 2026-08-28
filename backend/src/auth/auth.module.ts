import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailModule } from '../mail/mail.module';

/**
 * The signing secret has no default on purpose: a hard-coded fallback would be
 * public (it lives in the repository), so every token it signs is forgeable.
 * Failing at boot is the only safe behaviour.
 */
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too short — set a random secret of at least ' +
        '32 characters in your .env (see .env.example).',
    );
  }
  return secret;
}

@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
