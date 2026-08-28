import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Everything here either creates an account or checks a secret the caller
 * could guess (a password, a 6-digit code drawn from 10^6 values). The default
 * 100 req/min ceiling is far too generous for that, so each of these routes
 * gets its own budget: at 10 attempts/min a full sweep of the code space takes
 * roughly two years.
 */
const SENSITIVE = { default: { ttl: 60_000, limit: 10 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(SENSITIVE)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle(SENSITIVE)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('social')
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  social(@Body() dto: SocialLoginDto) {
    return this.authService.socialLogin(dto);
  }

  @Post('verify-email')
  @Throttle(SENSITIVE)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Req() req: Request, @Body() dto: VerifyEmailDto) {
    const user = req['user'] as { id: number };
    return this.authService.verifyEmail(user.id, dto);
  }

  @Post('resend-verification')
  @Throttle(SENSITIVE)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  resendVerification(@Req() req: Request) {
    const user = req['user'] as { id: number };
    return this.authService.resendVerification(user.id);
  }

  @Post('forgot-password')
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('verify-reset-code')
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(dto);
  }

  @Post('reset-password')
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
