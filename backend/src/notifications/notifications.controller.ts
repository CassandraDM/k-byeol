import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { UnregisterDeviceTokenDto } from './dto/unregister-device-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * Called by the app right after registration / login (and on every launch),
   * once the OS has granted notification permission.
   */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  register(@Req() req: Request, @Body() dto: RegisterDeviceTokenDto) {
    const user = req['user'] as { id: number };
    return this.notifications.registerToken(user.id, dto.token, dto.platform);
  }

  /** Called on sign-out so the device stops receiving this user's pushes. */
  @Delete('token')
  @HttpCode(HttpStatus.OK)
  unregister(@Req() req: Request, @Body() dto: UnregisterDeviceTokenDto) {
    const user = req['user'] as { id: number };
    return this.notifications.unregisterToken(user.id, dto.token);
  }
}
