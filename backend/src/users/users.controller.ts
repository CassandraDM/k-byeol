import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticated } from '../common/api-responses';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  username?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiTags('Users')
@ApiAuthenticated()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'A user profile, with fandoms and follow counters' })
  getById(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.usersService.getProfile(id, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update your own profile' })
  updateById(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = req['user'] as { id: number };
    if (user.id !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.usersService.updateProfile(id, dto);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'A user events, split into upcoming and past' })
  getEvents(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getUserEvents(id);
  }

  @Get(':id/listings')
  @ApiOperation({ summary: 'A user marketplace listings' })
  getListings(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getUserListings(id);
  }
}
