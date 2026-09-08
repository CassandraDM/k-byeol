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
import { ConfirmReactivationDto, ReactivateDto } from './dto/reactivate.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Everything here either creates an account or checks a secret the caller
 * could guess (a password, a 6-digit code drawn from 10^6 values). The default
 * 100 req/min ceiling is far too generous for that, so each of these routes
 * gets its own budget: at 10 attempts/min a full sweep of the code space takes
 * roughly two years.
 */
const SENSITIVE = { default: { ttl: 60_000, limit: 10 } };

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create an account' })
  @Throttle(SENSITIVE)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Sign in with an email and password' })
  @Throttle(SENSITIVE)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('social')
  @ApiOperation({ summary: 'Sign in with Google or Apple' })
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  social(@Body() dto: SocialLoginDto) {
    return this.authService.socialLogin(dto);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Confirm an email address with its 6-digit code' })
  @Throttle(SENSITIVE)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Req() req: Request, @Body() dto: VerifyEmailDto) {
    const user = req['user'] as { id: number };
    return this.authService.verifyEmail(user.id, dto);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Send a fresh email-verification code' })
  @Throttle(SENSITIVE)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  resendVerification(@Req() req: Request) {
    const user = req['user'] as { id: number };
    return this.authService.resendVerification(user.id);
  }

  /**
   * Both halves of bringing a deleted account back. Unauthenticated by
   * necessity — the whole point is that its owner cannot sign in — and gated
   * by a password or a provider session, which puts them in the same guessable
   * bracket as the rest of this controller.
   */
  @Post('reactivate')
  @ApiOperation({ summary: 'Ask for a deleted account back' })
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  reactivate(@Body() dto: ReactivateDto) {
    return this.authService.requestReactivation(dto);
  }

  @Post('reactivate/confirm')
  @ApiOperation({ summary: 'Finish a reactivation with its 6-digit code' })
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  confirmReactivation(@Body() dto: ConfirmReactivationDto) {
    return this.authService.confirmReactivation(dto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Start a password reset' })
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('verify-reset-code')
  @ApiOperation({ summary: 'Check a reset code without consuming it' })
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password with a reset code' })
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
