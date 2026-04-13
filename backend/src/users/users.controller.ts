import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;
}

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getProfile(@Req() req: Request) {
    const user = req['user'] as { id: number };
    return this.usersService.getProfile(user.id);
  }

  @Patch()
  updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const user = req['user'] as { id: number };
    return this.usersService.updateProfile(user.id, dto);
  }
}
